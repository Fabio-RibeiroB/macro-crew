import os
from crewai import Agent, Crew, Process, Task
from crewai.project import CrewBase, agent, crew, task, after_kickoff
from crewai.agents.agent_builder.base_agent import BaseAgent
from typing import List
from crewai_tools import ScrapeWebsiteTool, EXASearchTool

# If you want to run a snippet of code before or after the crew starts,
# you can use the @before_kickoff and @after_kickoff decorators
# https://docs.crewai.com/concepts/crews#example-crew-class-with-decorators
from uk_macro_crew.utils import get_exa_api_key, save_json_hook

os.environ["EXA_API_KEY"] = get_exa_api_key()


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
            llm="gpt-4o-mini",
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
