# Assistant

The in-app chat panel. It owns the conversation and the model loop; it owns no
business logic — every action it can take is a tool from `src/agent/`, and every
security decision was made there.

## Layout

| File | Role |
| --- | --- |
| `config.ts` | Model, limits, and the on/off switch |
| `openaiClient.ts` | Lazily-built SDK client |
| `prompt.ts` | System prompt, including injection defence |
| `toolBridge.ts` | Agent registry → OpenAI functions, and result summaries |
| `conversations.ts` | Persistence and transcript replay |
| `loop.ts` | The streaming model→tool→model loop |
| `events.ts` | The SSE protocol |

Routes live in `src/routes/assistant.ts`; the UI is `frontend/src/components/assistant/`.

## Configuration

Set `OPENAI_API_KEY` to switch the assistant on and `OPENAI_MODEL` to name the
model — there is no clever default-picking, because naming a model the account
cannot reach fails in front of a user mid-sentence rather than at boot. With no
key the backend boots normally, `/assistant/status` reports `enabled: false`, and
the UI renders nothing. Every other knob is in `config.ts` with a default.

`OPENAI_BASE_URL` points the client at Azure OpenAI or a compatible gateway.

## Why Chat Completions, not the Responses API

Chat Completions is supported by every OpenAI model and by the OpenAI-compatible
endpoints people actually run, and its streaming shape is stable — so `loop.ts`
does not have to track a newer event vocabulary. If the Responses API becomes
worth the switch, `streamOnce` in `loop.ts` is the only function that has to
change.

Two related choices:

- **`strict` mode is off.** It requires every property in `required` and
  `additionalProperties: false` throughout, which Zod-derived schemas do not
  satisfy — most tool parameters are genuinely optional. Loosening the schemas
  to satisfy it would advertise a contract the server does not enforce. The
  server re-validates every call with Zod regardless, so a malformed call
  returns a structured error the model can correct.
- **`temperature` is never sent.** Reasoning models reject it, and the default
  is right for this workload.

## The loop

`runTurn` persists the user message, replays the transcript, then repeats:
stream a completion → run any tool calls through `executeTool` → feed the
results back. It stops when the model stops asking for tools, or at
`MAX_TOOL_ITERATIONS`, which reports the limit rather than presenting a partial
answer as a complete one.

Each model turn is persisted as its own `assistant_message`. A turn that calls
tools, answers, then calls more tools has an order that matters —
`toTranscript` has to replay it exactly or the API rejects the request. That is
also why `provider_call_id` is stored rather than regenerated: a `tool` message
with no matching `tool_call_id` is a hard error.

## Rules

- **The loop never widens what Phase 1 decided.** It passes `AgentContext` and
  `AgentPolicy` straight through to `executeTool`. If the assistant needs a
  capability, it gets it by changing the policy it is constructed with, never by
  adding an exception here.
- **Read-only, for now.** Routes construct `READ_ONLY_POLICY`, so write tools are
  not advertised and would be refused if called. Phase 3 changes the policy and
  adds the approval round trip the executor already supports.
- **Failures go into the thread.** A tool error is fed back to the model, which
  usually corrects itself. A turn error becomes an `error` event the panel
  renders inline — not a toast, and not a thrown exception.
- **Record text is data.** The system prompt says so explicitly, because notes,
  descriptions and email bodies are attacker-influenced text that arrives inside
  tool results. Keep that section when editing the prompt.

## Auditing and cost

Tool calls are audited by the agent layer (see `src/agent/README.md`). On top of
that, every assistant message stores its own `input_tokens` / `output_tokens` and
the model that produced them, so the per-org cost question is answerable from the
database rather than from a provider dashboard.

`MAX_CONCURRENT_STREAMS_PER_USER` caps in-flight turns per user. That is a
runaway-client guard, not a rate limiter — real limits and per-org budgets are
Phase 5.
