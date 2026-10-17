import os
import re
from dataclasses import dataclass
from crewai import Agent, Crew, LLM, Process, Task
from crewai.project import CrewBase, agent, crew, task, after_kickoff
from crewai.agents.agent_builder.base_agent import BaseAgent
from typing import List
from crewai_tools import ScrapeWebsiteTool, EXASearchTool

# If you want to run a snippet of code before or after the crew starts,
# you can use the @before_kickoff and @after_kickoff decorators
# https://docs.crewai.com/concepts/crews#example-crew-class-with-decorators
from uk_macro_crew.utils import get_exa_api_key, save_json_hook

os.environ["EXA_API_KEY"] = get_exa_api_key()

# OpenAI retires gpt-4o, gpt-4o-mini, gpt-4.1 and gpt-4.1-mini on 2027-01-14.
# The migration guide recommends gpt-6-luna for those workloads. It is also the
# cost-appropriate choice here: cheaper per token than gpt-4o-mini, and aimed
# at repeated structured work such as this collection pipeline.
# https://help.openai.com/en/articles/20001600
DEFAULT_MODEL = "gpt-6-luna"

# Allowed efforts below are taken from the OpenAI model pages fetched
# 2026-10-17 (https://developers.openai.com/api/docs/models). The value we
# send when OPENAI_REASONING_EFFORT is unset is `default`, which is the
# documented default except where a comment says this app overrides it.
_EFFORT_ORDER = ("none", "minimal", "low", "medium", "high", "xhigh", "max")
_DATE_SUFFIX = re.compile(r"-\d{4}-\d{2}-\d{2}$")


class ReasoningEffortError(ValueError):
    """OPENAI_REASONING_EFFORT is not valid for the selected model."""


@dataclass(frozen=True)
class _ReasoningProfile:
    prefix: str
    allowed: frozenset[str]
    default: str


def _efforts(*names: str) -> frozenset[str]:
    return frozenset(names)


# Longest prefix wins. Snapshot dates are stripped before matching.
_REASONING_PROFILES: tuple[_ReasoningProfile, ...] = (
    # Chat Completions function calling requires none. The API default is medium.
    _ReasoningProfile(
        "gpt-6-luna",
        _efforts("none", "low", "medium", "high", "xhigh", "max"),
        "none",
    ),
    _ReasoningProfile(
        "gpt-6-sol",
        _efforts("none", "low", "medium", "high", "xhigh", "max"),
        "none",
    ),
    # Model page lists these values and does not label a default. medium is
    # in the list; none is rejected (HTTP 400).
    _ReasoningProfile(
        "gpt-6-astra",
        _efforts("low", "medium", "high", "xhigh", "max"),
        "medium",
    ),
    # Page: none and minimal are not supported; medium is the default.
    _ReasoningProfile(
        "gpt-6.1-sol",
        _efforts("low", "medium", "high", "xhigh", "max"),
        "medium",
    ),
    # Page: defaults to and only supports high.
    _ReasoningProfile("gpt-5-pro", _efforts("high"), "high"),
    _ReasoningProfile(
        "gpt-5.6-luna",
        _efforts("none", "low", "medium", "high", "xhigh", "max"),
        "medium",
    ),
    _ReasoningProfile(
        "gpt-5.6-sol",
        _efforts("none", "low", "medium", "high", "xhigh", "max"),
        "medium",
    ),
    _ReasoningProfile(
        "gpt-5.6-terra",
        _efforts("none", "low", "medium", "high", "xhigh", "max"),
        "medium",
    ),
    _ReasoningProfile(
        "gpt-5.5",
        _efforts("none", "low", "medium", "high", "xhigh"),
        "medium",
    ),
    _ReasoningProfile(
        "gpt-5.4-mini",
        _efforts("none", "low", "medium", "high", "xhigh"),
        "none",
    ),
    _ReasoningProfile(
        "gpt-5.4-nano",
        _efforts("none", "low", "medium", "high", "xhigh"),
        "none",
    ),
    _ReasoningProfile(
        "gpt-5.4",
        _efforts("none", "low", "medium", "high", "xhigh"),
        "none",
    ),
    _ReasoningProfile(
        "gpt-5.2",
        _efforts("none", "low", "medium", "high", "xhigh"),
        "none",
    ),
    _ReasoningProfile(
        "gpt-5.1",
        _efforts("none", "low", "medium", "high"),
        "none",
    ),
    # mini/nano pages do not repeat the list. The Using GPT-5 guide says
    # reasoning.effort supports minimal, low, medium, and high, and to start
    # with medium. https://developers.openai.com/api/docs/guides/gpt-5
    _ReasoningProfile(
        "gpt-5-mini",
        _efforts("minimal", "low", "medium", "high"),
        "medium",
    ),
    _ReasoningProfile(
        "gpt-5-nano",
        _efforts("minimal", "low", "medium", "high"),
        "medium",
    ),
    _ReasoningProfile(
        "gpt-5",
        _efforts("minimal", "low", "medium", "high"),
        "medium",
    ),
)

# These families have no reasoning.effort line on their model pages.
_NON_REASONING_PREFIXES: tuple[str, ...] = (
    "gpt-3.5",
    "gpt-4.1",
    "gpt-4o",
    "gpt-4",
)


def _bare_model_name(model: str) -> str:
    """Return the model id without a provider prefix or snapshot date."""
    name = model.rsplit("/", 1)[-1].strip().lower()
    if name.startswith("ft:"):
        parts = name.split(":")
        # ft:<org>:<base>:<id>
        if len(parts) >= 3 and parts[2]:
            name = parts[2]
    return _DATE_SUFFIX.sub("", name)


def _matches_prefix(name: str, prefix: str) -> bool:
    return name == prefix or name.startswith(prefix + "-")


def _reasoning_profile(name: str) -> _ReasoningProfile | None:
    matches = [
        profile
        for profile in _REASONING_PROFILES
        if _matches_prefix(name, profile.prefix)
    ]
    if not matches:
        return None
    return max(matches, key=lambda profile: len(profile.prefix))


def _is_non_reasoning_model(name: str) -> bool:
    """True when the model page does not accept reasoning_effort."""
    if "-chat" in name or name.startswith("chatgpt-"):
        return True
    return any(_matches_prefix(name, prefix) for prefix in _NON_REASONING_PREFIXES)


def _format_allowed(allowed: frozenset[str]) -> str:
    return ", ".join(effort for effort in _EFFORT_ORDER if effort in allowed)


def resolve_reasoning_effort(model: str, configured: str | None) -> str:
    """Return the reasoning_effort to send, or "" to omit it.

    Unset ``configured`` selects the model's verified default. An empty string
    omits the parameter. An explicit value the model does not accept raises
    ``ReasoningEffortError`` before any API call.
    """
    name = _bare_model_name(model)
    if configured is not None:
        effort = configured.strip().lower()
        if effort == "":
            return ""
    else:
        effort = None

    if _is_non_reasoning_model(name):
        if effort is None:
            return ""
        raise ReasoningEffortError(
            f"{name} does not accept reasoning_effort. "
            f"Unset OPENAI_REASONING_EFFORT (it is currently {effort!r})."
        )

    profile = _reasoning_profile(name)
    if profile is None:
        if effort is None:
            return ""
        raise ReasoningEffortError(
            f"No verified reasoning_effort values for {name!r}. "
            f"Refusing to send OPENAI_REASONING_EFFORT={effort!r}. "
            "Unset it to omit the parameter."
        )

    if effort is None:
        return profile.default
    if effort not in profile.allowed:
        raise ReasoningEffortError(
            f"{name} does not accept reasoning_effort={effort!r}. "
            f"Allowed values: {_format_allowed(profile.allowed)}. "
            f"Unset OPENAI_REASONING_EFFORT to use {profile.default!r}."
        )
    return effort


def build_agent_llm() -> LLM:
    """Build the shared agent LLM.

    ``MODEL`` overrides the default. ``OPENAI_REASONING_EFFORT`` overrides the
    per-model effort; an empty value omits the parameter. An explicit value
    the model does not accept raises ``ReasoningEffortError``.
    """
    model = (os.getenv("MODEL") or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    effort = resolve_reasoning_effort(model, os.getenv("OPENAI_REASONING_EFFORT"))

    llm = LLM(model=model, reasoning_effort=effort or None)

    # CrewAI 1.7.2's native OpenAI client only attaches reasoning_effort when
    # the model name contains "o1". additional_params are merged into the
    # Chat Completions body, which is how gpt-6-luna receives the setting.
    additional = getattr(llm, "additional_params", None)
    if effort and isinstance(additional, dict) and "reasoning_effort" not in additional:
        additional["reasoning_effort"] = effort
    return llm


@CrewBase
class UkMacroCrew:
    """UkMacroCrew crew"""

    agents: List[BaseAgent]
    tasks: List[Task]

    # Learn more about YAML configuration files here:
    # Agents: https://docs.crewai.com/concepts/agents#yaml-configuration-recommended
    # Tasks: https://docs.crewai.com/concepts/tasks#yaml-configuration-recommended

    # If you would like to add tools to your agents, you can learn more about it here:
    # https://docs.crewai.com/concepts/agents#agent-tools
    @agent
    def researcher(self) -> Agent:
        return Agent(
            config=self.agents_config["researcher"],  # type: ignore[index]
            verbose=True,
            tools=[
                EXASearchTool(base_url=os.getenv("EXA_BASE_URL")),
                ScrapeWebsiteTool(),
            ],
            llm=build_agent_llm(),
            max_rpm=int(os.getenv("AGENT_MAX_RPM", "150")),
            max_iter=int(os.getenv("AGENT_MAX_ITERATIONS", "5")),
            max_retry_limit=int(os.getenv("AGENT_MAX_RETRIES", "2")),
            max_execution_time=int(os.getenv("AGENT_MAX_EXECUTION_TIME", "900")),  # 15 minutes
            allow_delegation=False,  # Prevent delegation loops
        )

    @agent
    def reporting_analyst(self) -> Agent:
        return Agent(
            config=self.agents_config["reporting_analyst"],  # type: ignore[index]
            verbose=True,
            llm=build_agent_llm(),
            # No tools needed - LLM outputs JSON directly
            max_iter=int(os.getenv("AGENT_MAX_ITERATIONS", "5")),
            max_retry_limit=int(os.getenv("AGENT_MAX_RETRIES", "2")),
            max_execution_time=int(os.getenv("AGENT_MAX_EXECUTION_TIME", "600")),  # 10 minutes
            allow_delegation=False,  # Prevent delegation loops
        )

    # To learn more about structured task outputs,
    # task dependencies, and task callbacks, check out the documentation:
    # https://docs.crewai.com/concepts/tasks#overview-of-a-task
    @task
    def research_task(self) -> Task:
        return Task(
            config=self.tasks_config["research_task"],  # type: ignore[index]
        )

    @task
    def reporting_task(self) -> Task:
        return Task(
            config=self.tasks_config["reporting_task"],  # type: ignore[index]
            # The output is saved by the save_json_hook in the @after_kickoff method
        )

    @crew
    def crew(self) -> Crew:
        """Creates the UkMacroCrew crew"""
        return Crew(
            agents=self.agents,  # Automatically created by the @agent decorator
            tasks=self.tasks,  # Automatically created by the @task decorator
            process=Process.sequential,
            verbose=True,
            max_rpm=int(os.getenv("CREW_MAX_RPM", "100")),
        )

    @after_kickoff
    def save_report(self, result):
        """
        A method to be executed after the crew has finished its work.
        It saves the final research report to a local JSON file.
        """
        save_json_hook(result)
