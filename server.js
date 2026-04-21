const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const app = express();
app.use(express.json({ limit: '20mb' }));
app.post('/api/generate', async (req, res) => {  // route first
  ...
});
app.use(express.static(path.join(__dirname, 'public')));  // static last
  try {
    const { pdfBase64, positioning } = req.body;
    const systemPrompt = `You are an expert at creating professional candidate profile documents for Loop Consulting, an IT staffing firm.
Always respond with ONLY a valid JSON object — no preamble, no markdown fences. The JSON must have exactly these fields:
{
  "name": "Full Name",
  "location": "City, State",
  "jobTitle": "Current/Target Job Title",
  "summary": ["4-5 bullets, max 20 words each, punchy and specific — no run-on sentences"],
  "topSkills": ["6-8 most relevant skills for page 1"],
  "topExperience": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "dates": "Month Year – Month Year",
      "bullets": ["Max 2 most impressive bullets only"]
    }
  ],
  "fullSkills": "Preserve the complete skills, tools, and certifications section VERBATIM from the resume — do not paraphrase, summarize, or omit anything",
  "fullExperience": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "dates": "Month Year – Month Year",
      "bullets": ["All bullets preserved verbatim"]
    }
  ],
  "education": "Degree, University"
}
CRITICAL RULES:
- topExperience: top 2 most recent/relevant roles, max 2 bullets each, tightened for impact
- fullSkills: copy certifications, tools, and skills EXACTLY as written — never omit or paraphrase
- fullExperience: all roles, all bullets preserved with full fidelity — quantified results (%, $, timeframes) must never be altered
- summary: concise, client-facing, no fluff
- Do not invent any information`;
    const positioningNote = positioning ? `\nClient positioning note (incorporate as first summary bullet): ${positioning}` : '';
    const userPrompt = `Extract and format the candidate profile from this resume PDF.${positioningNote}\n\nReturn ONLY the JSON object.`;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
            { type: 'text', text: userPrompt }
          ]
        }]
      })
    });
    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.error?.message || 'API error' });
    }
    const data = await response.json();
    const rawText = data.content?.filter(b => b.type === 'text').map(b => b.text).join('');

    let parsed;
    try {
      const clean = rawText.replace(/```json|```/g, '').trim();
      const jsonMatch = clean.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON object found in response');
      const sanitized = jsonMatch[0]
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\n/g, ' ')
        .replace(/\r/g, ' ')
        .replace(/\t/g, ' ');
      parsed = JSON.parse(sanitized);
    } catch (parseErr) {
      console.error('JSON parse failed:', parseErr.message);
      console.error('Raw snippet around error:', rawText.substring(17700, 17800));
      return res.status(500).json({ error: 'Failed to parse AI response. The resume may contain unusual formatting — try a cleaned-up version of the PDF.' });
    }

    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Loop Profile Generator running on port ${PORT}`));
