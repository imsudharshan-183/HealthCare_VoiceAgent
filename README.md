
# HealthCare_VoiceAgent

A multilingual voice assistant for a clinic, built for elderly callers. It runs on [LiveKit Agents](https://docs.livekit.io/agents/) (Node.js / TypeScript) and uses Sarvam AI for speech and language, MongoDB Atlas for the clinic knowledge base and caller memory.

> **Safety note:** This assistant does not give medical advice. For questions about medicines, doses or symptoms it refers the caller to a doctor, pharmacist or clinic staff. It is not a medical device.

## Features

- **Voice pipeline:** Sarvam STT (`saaras:v3`), Sarvam LLM (`sarvam-105b`), Sarvam TTS (`bulbul:v3`), Silero VAD
- **Languages:** English, Hindi, Tamil, Kannada, Bengali, Marathi, Malayalam (fixed language or auto-switching)
- **Clinic knowledge (RAG):** answers about timings, location, doctors, fees and booking from `knowledge/clinic.md` using MongoDB Atlas Vector Search
- **Caller memory:** saves short notes about each caller and loads them in later sessions
- **Records:** saves caller details (name, age, carer, allergies) and reports incidents such as falls or emergencies
- **Tools:** current date and time, clinic lookup, simple non-medical translation
- **Call control:** silence timeout, maximum call length, goodbye detection
- **Testing:** language evals and LiveKit Cloud simulations

## Project structure

```
agent.ts          Main LiveKit agent
lang.ts           Language detection
translate.ts      Translation helper
prompts/          Base prompt and per-language prompts
rag/              Embedding, ingestion and retrieval for the knowledge base
memory/           Caller memory and records (MongoDB)
tools/            Agent tools (record keeping)
knowledge/        clinic.md (clinic facts)
scenario.yaml     Simulation scenarios
eval*.ts          Evals
```

## Requirements

- Node.js 22+
- A [LiveKit Cloud](https://cloud.livekit.io) project and the [LiveKit CLI](https://docs.livekit.io/reference/developer-tools/livekit-cli/) (`lk`)
- A Sarvam AI API key
- A MongoDB Atlas cluster (with Vector Search)

## Setup

```bash
git clone https://github.com/imsudharshan-183/HealthCare_VoiceAgent.git
cd HealthCare_VoiceAgent
npm install
```

Create a `.env` file (never commit it):

```
# LiveKit
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=

# Models
SARVAM_API_KEY=

# Database (check memory/memory.ts and rag/store.ts for the exact variable names)
MONGODB_URI=

# Agent
AGENT_NAME=hc-va
AGENT_LANGUAGE=en-IN
LANG_MODE=fixed

# Features
ENABLE_KB=true
ENABLE_TRANSLATE=true
MEMORY_ENABLED=false
RECORDS_ENABLED=true
CALLER_ID_MODE=test
TEST_CALLER_ID=

# Call limits
SILENCE_TIMEOUT_MS=10000
MAX_CALL_MS=600000
```

Notes:
- Leave `AGENT_NAME=` blank for automatic dispatch (the agent joins every room). With `hc-va`, your app must request that agent name.
- Use `CALLER_ID_MODE=participant` in production so each caller has their own memory.
- `LANG_MODE=auto` starts in `AGENT_LANGUAGE` and follows the caller's language.

## Knowledge base setup

1. Edit `knowledge/clinic.md` with your clinic details.
2. Create the memory collections: `npm run memory:setup`
3. Load the knowledge base: `npm run kb:ingest`
4. Create an Atlas Vector Search index named `kb_vec` on the `kb` collection, with the field `embedding`, 768 dimensions and cosine similarity.
5. Test retrieval: `npm run kb:test`

If you change the embedding model, rebuild the index and run `kb:ingest` again.

## Running

```bash
npm run dev            # run the agent and connect to LiveKit Cloud
npm run dev:hi         # fixed Hindi (also :en :ta :kn :bn :mr :ml)
npm run dev:auto       # auto-switch language
npm run console        # terminal test (also console:text for text only)
```

## Testing

```bash
npm run typecheck      # TypeScript check
npm run test:lang      # language evals
npm run memory:test    # memory tests
npm run records:test   # record tests
```

Run a simulation on LiveKit Cloud (the agent must be running):

```bash
lk agent simulate text --agent-name hc-va --scenarios scenario.yaml
lk agent simulate audio --agent-name hc-va --scenarios scenario.yaml
```

## Deploying to LiveKit Cloud

```bash
lk agent create
lk agent deploy
```

Add your secrets (Sarvam key, MongoDB URI and the rest of `.env`) through LiveKit's secrets, not through the repository.

## Privacy

- Caller IDs are hashed before they are stored.
- Do not commit `.env` or real patient data.
- Check your local regulations before using this with real patients.
