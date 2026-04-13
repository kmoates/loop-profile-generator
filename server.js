const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/generate', async (req, res) => {
  try {
    const { pdfBase64, rate, availability, positioning } = req.body;

    const systemPrompt = `You are an expert at creating professional candidate profile documents for Loop Consulting, an IT staffing firm. You extract structured information from resumes and format it into clean, client-ready profiles.

Always respond with ONLY a valid JSON object — no preamble, no markdown fences. The JSON must have exactly these fields:
{
  "name": "Full Name",
  "location": "City, State",
  "jobTitle": "Current/Target Job Title",
  "summary": ["Bullet point 1", "Bullet point 2", "Bullet point 3"],
  "skills": ["Skill 1", "Skill 2", "Skill 3", "...up to 10 skills"],
  "experience": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "dates": "Month Year – Month Year",
      "bullets": ["Achievement or responsibility", "Achievement or responsibility"]
    }
  ],
  "education": "Degree, University"
}

Summary should be 2-4 concise bullet points highlighting the candidate's value proposition.
Skills should be technical and relevant — list the most important ones.
Experience: include up to 4 most recent/relevant roles, 2-3 bullets each.
Keep everything factual and professional. Do not invent information.`;

    const userPrompt = `Extract and format the candidate profile from this resume PDF.${rate ? `\nRate: ${rate}` : ''}${availability ? `\nAvailability: ${availability}` : ''}${positioning ? `\nClient positioning note (use as primary summary or first summary bullet if provided): ${positioning}` : ''}

Return ONLY the JSON object described in your instructions.`;

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
    const clean = rawText.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    res.json(parsed);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Loop Profile Generator running on port ${PORT}`));
