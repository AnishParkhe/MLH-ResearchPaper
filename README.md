# ⏳ Research Time Machine

Turn a research paper into an interactive experiment. Upload a PDF and Gemini extracts its claims, evidence, assumptions, methods, equations, limitations and citations into a live knowledge graph.

- **Knowledge graph:** click a claim to see the evidence for it (quotes are highlighted in the PDF), the assumptions behind it, and an experiment that could disprove it.
- **What if it's false?** Break an assumption or right-click any node, and the damage spreads through the dependent claims.
- **Challenge a claim:** Gemini referees your objection against the paper and rules that the claim stands, is weakened, or falls.
- **Time machine:** scrub from the paper's foundational references, through publication, to the experiments it proposes.
- **Playable equations:** key equations become interactive plots with sliders.

## Run

```bash
npm install
cp .env.example .env   # add your Gemini API key
npm run dev            # http://localhost:5173
```

The sample paper ("Attention Is All You Need") is cached in `data/`, so it loads instantly.

Built with Gemini (`@google/genai`), React, Vite, react-force-graph, pdf.js, KaTeX, mathjs, Recharts and Framer Motion.
