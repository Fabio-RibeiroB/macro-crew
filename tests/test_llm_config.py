"""LLM selection for the macro crew agents."""

import json

import httpx
import pytest
from openai import OpenAI

from uk_macro_crew.crew import (
    DEFAULT_MODEL,
    ReasoningEffortError,
    UkMacroCrew,
    build_agent_llm,
    resolve_reasoning_effort,
)


def _completion_response() -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "id": "chatcmpl-test",
            "object": "chat.completion",
            "created": 0,
            "model": DEFAULT_MODEL,
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": "ok"},
                    "finish_reason": "stop",
                }
            ],
            "usage": {
                "prompt_tokens": 1,
                "completion_tokens": 1,
                "total_tokens": 2,
            },
        },
    )


@pytest.fixture
def openai_key(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setenv("EXA_API_KEY", "exa-test")


def test_default_model_is_gpt6_luna_with_reasoning_none(monkeypatch, openai_key):
    monkeypatch.delenv("MODEL", raising=False)
    monkeypatch.delenv("OPENAI_REASONING_EFFORT", raising=False)

    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content.decode())
        return _completion_response()

    llm = build_agent_llm()
    llm.client = OpenAI(
        api_key="sk-test",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    params = llm._prepare_completion_params(
        messages=[{"role": "user", "content": "hi"}]
    )
    llm.client.chat.completions.create(**params)

    assert captured["body"]["model"] == "gpt-6-luna"
    assert captured["body"]["reasoning_effort"] == "none"


def test_model_env_overrides_default(monkeypatch, openai_key):
    monkeypatch.setenv("MODEL", "openai/gpt-6-luna")
    monkeypatch.delenv("OPENAI_REASONING_EFFORT", raising=False)

    llm = build_agent_llm()
    assert llm.model == "gpt-6-luna"
    params = llm._prepare_completion_params(
        messages=[{"role": "user", "content": "hi"}]
    )
    assert params["reasoning_effort"] == "none"


def test_reasoning_effort_omitted_for_non_reasoning_override(monkeypatch, openai_key):
    monkeypatch.setenv("MODEL", "gpt-4o-mini")
    monkeypatch.delenv("OPENAI_REASONING_EFFORT", raising=False)

    llm = build_agent_llm()
    params = llm._prepare_completion_params(
        messages=[{"role": "user", "content": "hi"}]
    )
    assert params["model"] == "gpt-4o-mini"
    assert "reasoning_effort" not in params


def test_non_reasoning_model_rejects_explicit_effort():
    with pytest.raises(ReasoningEffortError, match="does not accept reasoning_effort"):
        resolve_reasoning_effort("gpt-4o-mini", "low")
    with pytest.raises(ReasoningEffortError, match="gpt-4.1"):
        resolve_reasoning_effort("gpt-4.1-mini", "none")


def test_model_that_rejects_none_gets_a_supported_default(monkeypatch, openai_key):
    monkeypatch.setenv("MODEL", "gpt-6-astra")
    monkeypatch.delenv("OPENAI_REASONING_EFFORT", raising=False)

    llm = build_agent_llm()
    params = llm._prepare_completion_params(
        messages=[{"role": "user", "content": "hi"}]
    )
    assert params["model"] == "gpt-6-astra"
    assert params["reasoning_effort"] == "medium"
    assert params["reasoning_effort"] != "none"


def test_gpt5_pro_defaults_to_only_supported_effort():
    assert resolve_reasoning_effort("gpt-5-pro", None) == "high"
    assert resolve_reasoning_effort("openai/gpt-5-pro-2025-10-06", None) == "high"


def test_explicit_invalid_effort_fails_before_the_api(monkeypatch, openai_key):
    monkeypatch.setenv("MODEL", "gpt-6-astra")
    monkeypatch.setenv("OPENAI_REASONING_EFFORT", "none")

    with pytest.raises(ReasoningEffortError, match="does not accept reasoning_effort='none'") as exc:
        build_agent_llm()

    message = str(exc.value)
    assert "low" in message
    assert "medium" in message
    assert "Unset OPENAI_REASONING_EFFORT" in message


def test_explicit_valid_override_is_sent(monkeypatch, openai_key):
    monkeypatch.setenv("MODEL", "gpt-6-luna")
    monkeypatch.setenv("OPENAI_REASONING_EFFORT", "HIGH")

    llm = build_agent_llm()
    params = llm._prepare_completion_params(
        messages=[{"role": "user", "content": "hi"}]
    )
    assert params["reasoning_effort"] == "high"


def test_unverified_model_omits_effort_and_rejects_a_guess():
    assert resolve_reasoning_effort("o3", None) == ""
    with pytest.raises(ReasoningEffortError, match="No verified reasoning_effort"):
        resolve_reasoning_effort("o3", "none")


def test_empty_reasoning_effort_is_omitted(monkeypatch, openai_key):
    monkeypatch.delenv("MODEL", raising=False)
    monkeypatch.setenv("OPENAI_REASONING_EFFORT", "")

    llm = build_agent_llm()
    params = llm._prepare_completion_params(
        messages=[{"role": "user", "content": "hi"}]
    )
    assert params["model"] == "gpt-6-luna"
    assert "reasoning_effort" not in params


def test_both_agents_and_crew_use_configured_model(monkeypatch, openai_key):
    monkeypatch.setenv("MODEL", "gpt-6-luna")
    monkeypatch.setenv("OPENAI_REASONING_EFFORT", "none")

    crew_instance = UkMacroCrew()
    researcher = crew_instance.researcher()
    analyst = crew_instance.reporting_analyst()
    crew = crew_instance.crew()

    assert researcher.llm.model == "gpt-6-luna"
    assert analyst.llm.model == "gpt-6-luna"
    assert [agent.llm.model for agent in crew.agents] == ["gpt-6-luna", "gpt-6-luna"]
    for agent in (researcher, analyst):
        params = agent.llm._prepare_completion_params(
            messages=[{"role": "user", "content": "hi"}]
        )
        assert params["reasoning_effort"] == "none"
