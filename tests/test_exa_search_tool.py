"""ExaSearchTool tests. The Exa client is always mocked; no network or real key."""

from unittest.mock import MagicMock, patch

import pytest

pytest.importorskip("crewai")

from uk_macro_crew.tools.exa_search import ExaSearchSchema, ExaSearchTool  # noqa: E402


def make_tool(**kwargs):
    tool = ExaSearchTool(**kwargs)
    tool.client = MagicMock()
    return tool


def test_name_description_and_schema():
    tool = ExaSearchTool(base_url=None)
    assert tool.name == "EXASearchTool"  # task prompts refer to this name
    # CrewAI prefixes the description with the tool name and argument schema.
    assert tool.description.endswith("Search the internet using Exa")
    assert "search_query" in tool.description
    assert tool.args_schema is ExaSearchSchema
    fields = ExaSearchSchema.model_fields
    assert set(fields) == {
        "search_query", "start_published_date", "end_published_date", "include_domains",
    }
    assert fields["search_query"].is_required()
    # The prompts only pass search_query.
    assert ExaSearchSchema(search_query="UK inflation").include_domains is None


def test_search_passes_query_and_defaults_and_formats_results():
    tool = make_tool(base_url=None)
    tool.client.search.return_value = "Title: Bank Rate\nURL: https://www.bankofengland.co.uk/x"
    out = tool.run(search_query="bank rate")
    tool.client.search.assert_called_once_with("bank rate", type="auto")
    assert "Bank Rate" in out and "bankofengland.co.uk" in out


def test_optional_filters_forwarded_only_when_set():
    tool = make_tool(base_url=None)
    tool.client.search.return_value = "ok"
    tool.run(search_query="gdp", start_published_date="2026-01-01",
             end_published_date="2026-02-01", include_domains=["ons.gov.uk"])
    tool.client.search.assert_called_once_with(
        "gdp", type="auto", start_published_date="2026-01-01",
        end_published_date="2026-02-01", include_domains=["ons.gov.uk"],
    )


def test_empty_results():
    tool = make_tool(base_url=None)
    tool.client.search.return_value = ""
    assert tool.run(search_query="nothing") == "No results found."


def test_client_exception_returns_message_without_leaking_details():
    tool = make_tool(base_url=None)
    tool.client.search.side_effect = RuntimeError("401 key=sk-secret-value")
    out = tool.run(search_query="cpih")
    assert "Exa search failed" in out and "RuntimeError" in out
    assert "sk-secret-value" not in out


def test_client_built_with_base_url_and_env_key(monkeypatch):
    monkeypatch.setenv("EXA_API_KEY", "exa-test")
    with patch("exa_py.Exa") as exa_cls:
        exa_cls.return_value.search.return_value = "result"
        tool = ExaSearchTool(base_url="https://exa.example.test")
        assert tool.run(search_query="q") == "result"
    exa_cls.assert_called_once_with(api_key="exa-test", base_url="https://exa.example.test")


def test_client_built_without_base_url_when_unset(monkeypatch):
    monkeypatch.setenv("EXA_API_KEY", "exa-test")
    monkeypatch.delenv("EXA_BASE_URL", raising=False)
    with patch("exa_py.Exa") as exa_cls:
        exa_cls.return_value.search.return_value = "result"
        ExaSearchTool().run(search_query="q")
    exa_cls.assert_called_once_with(api_key="exa-test")


def test_client_construction_failure_does_not_crash(monkeypatch):
    monkeypatch.delenv("EXA_API_KEY", raising=False)
    with patch("exa_py.Exa", side_effect=ValueError("no key")):
        out = ExaSearchTool(base_url=None).run(search_query="q")
    assert "Exa search failed" in out
