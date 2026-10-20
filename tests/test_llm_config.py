"""LLM selection for the macro crew agents."""

import json

import httpx
import pytest
from openai import OpenAI

from uk_macro_crew.crew import DEFAULT_MODEL, UkMacroCrew, build_agent_llm


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


def test_paid_calls_have_output_timeout_and_retry_limits(monkeypatch, openai_key):
    monkeypatch.setenv("FINSTATS_AI_MAX_OUTPUT_TOKENS", "2048")
    llm = build_agent_llm()
    params = llm._prepare_completion_params(messages=[{"role": "user", "content": "hi"}])
    assert params["max_tokens"] == 2048
    assert llm.client.max_retries == 0
    assert llm.timeout == 60
    monkeypatch.setenv("FINSTATS_AI_MAX_OUTPUT_TOKENS", "8193")
    with pytest.raises(ValueError): build_agent_llm()
