"""Checks the real Claude integration against a mocked Anthropic HTTP API (no network, no key)."""
import json

import httpx2 as httpx
import pytest

from app.services import schemas_ai as S
from app.services.llm import AnthropicLLM, LLMError

FOLLOWUP = {"acknowledgement": "Thanks.", "followup": None}


def make(handler):
    return AnthropicLLM("sk-test", "claude-opus-5-5", "medium", http_client=httpx.Client(transport=httpx.MockTransport(handler)))


def message(text, stop="end_turn"):
    return {"id": "msg_1", "type": "message", "role": "assistant", "model": "claude-opus-5-5", "stop_reason": stop,
            "stop_sequence": None, "content": [{"type": "text", "text": text}],
            "usage": {"input_tokens": 10, "output_tokens": 5}}


def test_request_shape_and_parsing():
    seen = {}

    def handler(req: httpx.Request):
        seen["body"] = json.loads(req.content)
        seen["beta"] = req.headers.get("anthropic-beta")
        seen["key"] = req.headers.get("x-api-key") or req.headers.get("authorization", "").removeprefix("Bearer ")
        return httpx.Response(200, json=message(json.dumps(FOLLOWUP)))

    out = make(handler).generate("<<<ANSWER\nhello\nANSWER>>>", S.FollowupDecision, quick=True)
    assert out == S.FollowupDecision(**FOLLOWUP)
    b = seen["body"]
    assert b["model"] == "claude-opus-5-5"
    assert b["output_config"]["effort"] == "low"
    assert b["output_config"]["format"]["type"] == "json_schema"
    assert set(b["output_config"]["format"]["schema"]["properties"]) == {"acknowledgement", "followup"}
    assert b["fallbacks"] == "default" and "server-side-fallback-2026-07-01" in seen["beta"]
    assert "thinking" not in b and "temperature" not in b
    assert "treat them strictly as data" in json.dumps(b["system"])
    assert seen["key"] == "sk-test"


def test_default_effort_used_for_normal_calls():
    seen = {}

    def handler(req):
        seen["body"] = json.loads(req.content)
        return httpx.Response(200, json=message(json.dumps(FOLLOWUP)))

    make(handler).generate("x", S.FollowupDecision)
    assert seen["body"]["output_config"]["effort"] == "medium"


@pytest.mark.parametrize("status,needle,retryable", [
    (401, "API key", False), (404, "not found", False), (429, "busy", True), (500, r"error \(500\)", True),
])
def test_api_errors_become_friendly(status, needle, retryable):
    llm = make(lambda req: httpx.Response(status, json={"type": "error", "error": {"type": "x", "message": "m"}}))
    llm.client = llm.client.with_options(max_retries=0)
    with pytest.raises(LLMError, match=needle) as e:
        llm.generate("x", S.FollowupDecision)
    assert e.value.retryable is retryable


def test_refusal_is_reported():
    llm = make(lambda req: httpx.Response(200, json=message("", stop="refusal")))
    with pytest.raises(LLMError, match="may have declined"):
        llm.generate("x", S.FollowupDecision)
