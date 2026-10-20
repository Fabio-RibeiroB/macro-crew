"""Model policy tests require no SDK, API credentials or CrewAI imports."""
import pytest
from uk_macro_crew.llm_config import (
    ReasoningEffortError, _bare_model_name, resolve_reasoning_effort,
)


@pytest.mark.parametrize('effort', ['low', 'medium', 'high'])
def test_o3_explicit_effort_is_supported(effort):
    assert resolve_reasoning_effort('openai/o3-2025-04-16', effort) == effort


def test_o3_default_and_invalid_effort():
    assert resolve_reasoning_effort('o3', None) == 'medium'
    with pytest.raises(ReasoningEffortError):
        resolve_reasoning_effort('o3', 'none')


@pytest.mark.parametrize('model', ['gpt-6-luna-mini', 'gpt-5.4-mystery', 'gpt-5.4-pro-extra'])
def test_unverified_variants_do_not_inherit_parent_policy(model):
    assert resolve_reasoning_effort(model, None) == ''
    with pytest.raises(ReasoningEffortError, match='No verified'):
        resolve_reasoning_effort(model, 'medium')


def test_verified_pro_does_not_inherit_none():
    assert resolve_reasoning_effort('gpt-5.4-pro-2026-03-05', None) == 'medium'
    with pytest.raises(ReasoningEffortError):
        resolve_reasoning_effort('gpt-5.4-pro', 'none')


@pytest.mark.parametrize('model,base', [
    ('ft:gpt-4o-mini-2024-07-18:example:custom:abc', 'gpt-4o-mini'),
    ('openai/ft:gpt-4.1-nano-2025-04-14:org::abc:ckpt-step-2000', 'gpt-4.1-nano'),
    ('ft:gpt-5-mini:org:suffix:abc', 'gpt-5-mini'),
])
def test_fine_tuned_identity_uses_base_model(model, base):
    assert _bare_model_name(model) == base
    assert resolve_reasoning_effort(model, None) == resolve_reasoning_effort(base, None)


def test_organisation_name_cannot_select_a_reasoning_profile():
    model = 'ft:gpt-4o-mini-2024-07-18:gpt-5-pro::abc'
    assert resolve_reasoning_effort(model, None) == ''
    with pytest.raises(ReasoningEffortError, match='does not accept'):
        resolve_reasoning_effort(model, 'high')


def test_existing_default_empty_override_and_snapshot_remain_supported():
    assert resolve_reasoning_effort('gpt-6-luna', None) == 'none'
    assert resolve_reasoning_effort('openai/gpt-6-luna-2026-10-01', None) == 'none'
    assert resolve_reasoning_effort('gpt-6-luna', '') == ''
    assert resolve_reasoning_effort('gpt-6-luna', 'HIGH') == 'high'
