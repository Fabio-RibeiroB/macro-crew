"""Pure model identity and reasoning-effort policy; no API client initialisation."""
import re
from dataclasses import dataclass

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
    model: str
    allowed: frozenset[str]
    default: str


def _efforts(*names: str) -> frozenset[str]:
    return frozenset(names)


# Exact identities only. A dated snapshot uses its explicitly listed base model.
_REASONING_PROFILES: tuple[_ReasoningProfile, ...] = (
    # https://developers.openai.com/api/docs/guides/reasoning
    _ReasoningProfile("o3", _efforts("low", "medium", "high"), "medium"),
    # https://developers.openai.com/api/docs/models/gpt-5.4-pro
    # Reasoning policy only; this model requires the Responses API.
    _ReasoningProfile("gpt-5.4-pro", _efforts("medium", "high", "xhigh"), "medium"),
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
        # ft:<base-model>:<organisation>:<suffix>:<id>[:checkpoint]
        if len(parts) >= 5 and parts[1]:
            name = parts[1]
    return _DATE_SUFFIX.sub("", name)


def _matches_prefix(name: str, prefix: str) -> bool:
    return name == prefix or name.startswith(prefix + "-")


def completion_token_parameter(model: str) -> str:
    """Select the Chat Completions output limit independently of effort policy."""
    name = _bare_model_name(model)
    generation = re.match(r"^gpt-(\d+)(?:-|$)", name)
    if re.match(r"^o\d", name) or (generation and int(generation.group(1)) >= 5):
        return "max_completion_tokens"
    return "max_tokens"


def _reasoning_profile(name: str) -> _ReasoningProfile | None:
    return next((profile for profile in _REASONING_PROFILES if name == profile.model), None)


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
