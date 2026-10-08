# HealthCare_VoiceAgent

A multilingual voice and chat health companion for elderly users. It is designed to be embedded in a mobile app and a website, where older adults can talk or chat to get general health information, receive medication and appointment reminders, and understand the results of health scans or reports they upload. If readings fall outside normal ranges, it advises the user to see a doctor and, with the user's consent, shares the findings with a linked caregiver application.

Built with LiveKit Agents (Node.js / TypeScript), Sarvam AI for speech and language, and MongoDB Atlas for the knowledge base and user memory.

> **Safety note:** This assistant does not diagnose conditions, prescribe, or replace a doctor. It explains general information, flags readings that look unusual, and refers users to a doctor, pharmacist or emergency services. It is not a medical device. Camera-based or app-based scan estimates are screening aids, not clinical measurements.

## Status

| Area | Status |
|---|---|
| Voice pipeline (STT, LLM, TTS, VAD) | Built |
| 7 languages, fixed or auto-switching | Built |
| RAG knowledge base (MongoDB Atlas Vector Search) | Built |
| Caller memory across sessions | Built |
| Records and incident reporting (falls, emergencies) | Built |
| Call controls (silence timeout, max length, goodbye detection) | Built |
| Language evals and LiveKit Cloud simulations | Built |
| Medication and appointment reminders | Planned |
| Upload and explanation of scan results or reports | Planned |
| Rule-based abnormality detection with severity levels | Planned |
| Consent-based sharing with the caregiver application | Planned |
| Text chat interface alongside voice | Planned |
| Mobile app and website integration | Planned |
| Telephony (SIP) for phone calls | Planned |

## Features

- **Voice pipeline:** Sarvam STT (saaras:v3), Sarvam LLM (sarvam-105b), Sarvam TTS (bulbul:v3), Silero VAD
- **Languages:** English, Hindi, Tamil, Kannada, Bengali, Marathi, Malayalam
- **Health information (RAG):** answers from a curated knowledge base in `knowledge/` using MongoDB Atlas Vector Search
- **Memory:** saves short notes about each user and loads them in later sessions
- **Records:** stores user details (name, age, carer, allergies) and reports incidents such as falls or emergencies
- **Tools:** current date and time, knowledge lookup, simple non-medical translation
- **Call control:** silence timeout, maximum call length, goodbye detection

## Planned design

```
 App / Website (voice + chat)
            |
      LiveKit Agent  <---->  MongoDB Atlas
            |                (profiles, memory, results, reminders)
   +--------+---------+
   |        |         |
Reminders  Results   Escalation
scheduler  rules      + consent-based
           engine     caregiver sharing
```

### Safety design for result explanations

- **Flags come from code, not the LLM.** A rules engine compares readings with reference ranges and assigns a severity (normal, mild, severe). The LLM only explains the outcome in plain language.
- **No diagnosis.** The agent says a reading is outside the usual range and suggests seeing a doctor. It does not name conditions.
- **Severe findings escalate.** The agent urges the user to contact a doctor or emergency services, and notifies the caregiver if the user has consented.
- **Consent first.** Sharing with a caregiver requires explicit consent that is stored, logged and revocable.
- **Transparency.** The agent identifies itself as an AI and states its limits at the start of a session.

## Project structure

```
agent.ts          Main LiveKit agent
lang.ts           Language detection
translate.ts      Translation helper
prompts/          Base prompt and per-language prompts
rag/              Embedding, ingestion and retrieval for the knowledge base
memory/           User memory and records (MongoDB)
tools/            Agent tools (record keeping)
knowledge/        Knowledge base content
scenario.yaml     Simulation scenarios
eval*.ts          Evals
```

## Requirements

- Node.js 22+
- A LiveKit Cloud project and the LiveKit CLI (`lk`)
- A Sarvam AI API key
- A MongoDB Atlas cluster (with Vector Search)

## Setup

```bash
git clone https://github.com/imsudharshan-183/HealthCare_VoiceAgent.git
cd HealthCare_VoiceAgent
npm install
```

Create a `.env` file (never commit it):

```env
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
- Use `CALLER_ID_MODE=participant` in production so each user has their own memory.
- `LANG_MODE=auto` starts in `AGENT_LANGUAGE` and follows the user's language.

## Knowledge base setup

1. Edit the files in `knowledge/` with your content.
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

## Roadmap

1. Medication and appointment reminders (scheduler, push or call-out)
2. Result upload, with a rules engine and plain-language explanations
3. Consent management and caregiver alerts
4. Text chat interface and app/website embedding
5. SIP telephony, semantic turn detection and noise cancellation
6. Human handoff for emergencies

## Privacy and compliance

- User IDs are hashed before they are stored.
- Do not commit `.env` or real patient data.
- Health data is sensitive. Review local regulations (for example India's DPDP Act) before using this with real users.

## Disclaimer

This is a learning and prototype project. It is not a medical device and must not be used for diagnosis or treatment decisions.