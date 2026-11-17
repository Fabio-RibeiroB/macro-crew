"""Small Exa web-search tool for the researcher agent.

Replaces ``crewai_tools.EXASearchTool`` (crewai-tools 1.7.2) so the project does
not need the ``crewai[tools]`` extra. The tool name, description and argument
schema match the original, so the task prompts that name ``EXASearchTool`` and
pass ``search_query`` keep working. As with the original defaults it runs
``Exa.search(query, type="auto")`` without page contents.

The API key comes from ``EXA_API_KEY`` only; it is never logged or returned.
"""

import os
from typing import Any, Optional

from crewai.tools import BaseTool
from pydantic import BaseModel, ConfigDict, Field


class ExaSearchSchema(BaseModel):
    search_query: str = Field(
        ..., description="Mandatory search query you want to use to search the internet"
    )
    start_published_date: Optional[str] = Field(
        None, description="Start date for the search"
    )
    end_published_date: Optional[str] = Field(None, description="End date for the search")
    include_domains: Optional[list[str]] = Field(
        None, description="List of domains to include in the search"
    )


class ExaSearchTool(BaseTool):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    name: str = "EXASearchTool"
    description: str = "Search the internet using Exa"
    args_schema: type[BaseModel] = ExaSearchSchema
    base_url: Optional[str] = Field(default_factory=lambda: os.getenv("EXA_BASE_URL"))
    search_type: str = "auto"
    client: Any = None

    def _get_client(self) -> Any:
        if self.client is None:
            from exa_py import Exa

            kwargs: dict[str, str] = {}
            api_key = os.getenv("EXA_API_KEY")
            if api_key:
                kwargs["api_key"] = api_key
            if self.base_url:
                kwargs["base_url"] = self.base_url
            self.client = Exa(**kwargs)
        return self.client

    def _run(
        self,
        search_query: str,
        start_published_date: Optional[str] = None,
        end_published_date: Optional[str] = None,
        include_domains: Optional[list[str]] = None,
    ) -> str:
        params: dict[str, Any] = {"type": self.search_type}
        if start_published_date:
            params["start_published_date"] = start_published_date
        if end_published_date:
            params["end_published_date"] = end_published_date
        if include_domains:
            params["include_domains"] = include_domains

        try:
            response = self._get_client().search(search_query, **params)
        except Exception as exc:  # report to the agent instead of aborting the crew
            return f"Exa search failed ({type(exc).__name__}). Try a different search."

        text = str(response).strip()
        return text or "No results found."
