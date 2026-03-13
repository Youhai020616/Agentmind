#!/usr/bin/env bash
# =============================================================================
# AgentMind - Intent Layer Observer
# Hook: UserPromptSubmit (async)
#
# Captures user intent signals:
# - Prompt length and type
# - Correction signals (user correcting Agent behavior)
# - Task type classification
# =============================================================================

set -euo pipefail

# Read hook input from stdin
INPUT=$(cat)

# Validate JSON input
if [ -z "$INPUT" ] || ! echo "$INPUT" | jq empty 2>/dev/null; then
  exit 0
fi

# Extract fields
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
PROMPT=$(echo "$INPUT" | jq -r '.prompt // ""')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Skip empty prompts
if [ -z "$PROMPT" ]; then
  exit 0
fi

# --- Detect correction signals ---
HAS_CORRECTION=false
CORRECTION_TYPE="none"

# Strong correction signals (English + Chinese)
if echo "$PROMPT" | grep -iqE "^(no[,.]|wrong|not that|that's wrong|incorrect)|(不对|错了|不是这样|这个不行|搞错了|不是这个意思)"; then
  HAS_CORRECTION=true
  CORRECTION_TYPE="explicit_rejection"
elif echo "$PROMPT" | grep -iqE "(instead|rather|actually|I meant|I want|don't|shouldn't|stop)|(换一个|改成|我要的是|其实是|不要这样|应该是|别用|用这个)"; then
  HAS_CORRECTION=true
  CORRECTION_TYPE="redirection"
elif echo "$PROMPT" | grep -iqE "(again|retry|redo|try again|one more time|revert)|(重新来|再试|重做|再来一次|撤回|回退)"; then
  HAS_CORRECTION=true
  CORRECTION_TYPE="retry_request"
fi

# --- Classify prompt type ---
PROMPT_TYPE="general"
if echo "$PROMPT" | grep -iqE "(fix|bug|error|broken|crash|fail)|(修复|报错|bug|出错|崩溃|失败|不工作)"; then
  PROMPT_TYPE="debugging"
elif echo "$PROMPT" | grep -iqE "(create|build|add|implement|make|write)|(创建|新建|添加|实现|写一个|做一个|搭建)"; then
  PROMPT_TYPE="creation"
elif echo "$PROMPT" | grep -iqE "(refactor|improve|optimize|clean|reorganize)|(重构|优化|改进|清理|整理)"; then
  PROMPT_TYPE="improvement"
elif echo "$PROMPT" | grep -iqE "(explain|what|why|how|understand)|(解释|什么是|为什么|怎么|说明|介绍)"; then
  PROMPT_TYPE="understanding"
elif echo "$PROMPT" | grep -iqE "(test|spec|coverage|assert)|(测试|单元测试|覆盖率|断言)"; then
  PROMPT_TYPE="testing"
fi

# --- Build observation record ---
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$(dirname "$0")")}"
DATA_DIR="${PLUGIN_ROOT}/data/observations"
mkdir -p "$DATA_DIR"

OBSERVATION=$(jq -cn \
  --arg sid "$SESSION_ID" \
  --arg ts "$TIMESTAMP" \
  --arg ptype "$PROMPT_TYPE" \
  --argjson plen "${#PROMPT}" \
  --argjson correction "$HAS_CORRECTION" \
  --arg ctype "$CORRECTION_TYPE" \
  '{
    layer: "intent",
    session_id: $sid,
    timestamp: $ts,
    event: "user_prompt",
    data: {
      prompt_type: $ptype,
      prompt_length: $plen,
      has_correction: $correction,
      correction_type: $ctype
    }
  }')

# Append to daily observation file
echo "$OBSERVATION" >> "${DATA_DIR}/$(date +%Y-%m-%d).jsonl"

# --- Phase 1.2: Implicit human feedback on correction ---
# When user corrects the agent, decrease human score of active instincts
if [ "$HAS_CORRECTION" = "true" ]; then
  ACTIVE_FILE="${PLUGIN_ROOT}/data/active-instincts.json"
  INSTINCTS_FILE="${PLUGIN_ROOT}/data/instincts.json"

  if [ -f "$ACTIVE_FILE" ] && [ -f "$INSTINCTS_FILE" ]; then
    INJECTED_COUNT=$(jq -r '.injected_ids // [] | length' "$ACTIVE_FILE" 2>/dev/null || echo "0")

    if [ "$INJECTED_COUNT" -gt 0 ]; then
      # Correction severity: explicit_rejection → -0.1, redirection → -0.05, retry → -0.03
      case "$CORRECTION_TYPE" in
        explicit_rejection) DELTA="-0.10" ;;
        redirection)        DELTA="-0.05" ;;
        retry_request)      DELTA="-0.03" ;;
        *)                  DELTA="0" ;;
      esac

      if [ "$DELTA" != "0" ]; then
        INSTINCTS_TMP="${INSTINCTS_FILE}.hf.tmp.$$"
        jq --argjson activeIds "$(jq '.injected_ids' "$ACTIVE_FILE")" \
           --argjson delta "$DELTA" \
           '
           .instincts |= map(
             if (.id as $id | $activeIds | index($id)) then
               .confidence.human = ((.confidence.human + $delta) | if . > 1 then 1 elif . < 0 then 0 else (. * 100 | round / 100) end) |
               .confidence.composite = (
                 .confidence.frequency * 0.35 +
                 .confidence.effectiveness * 0.40 +
                 .confidence.human * 0.25
               | . * 100 | round / 100) |
               if .confidence.composite < 0.2 then .status = "deprecated" else . end
             else .
             end
           )
           ' "$INSTINCTS_FILE" > "$INSTINCTS_TMP" 2>/dev/null && \
        mv "$INSTINCTS_TMP" "$INSTINCTS_FILE" 2>/dev/null || rm -f "$INSTINCTS_TMP"
      fi
    fi
  fi
fi

exit 0
