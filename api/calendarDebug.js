export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(response.status).json({ error: `Failed: ${response.statusText}` });
    }
    const data = await response.text();
    
    // Parse the iCal data to show a summary
    const lines = data.split('\n');
    const events = [];
    let currentEvent = null;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === 'BEGIN:VEVENT') {
        currentEvent = {};
      } else if (trimmed === 'END:VEVENT' && currentEvent) {
        events.push(currentEvent);
        currentEvent = null;
      } else if (currentEvent) {
        if (trimmed.startsWith('SUMMARY:')) currentEvent.summary = trimmed.slice(8);
        if (trimmed.startsWith('DTSTART')) currentEvent.dtstart = trimmed;
        if (trimmed.startsWith('DTEND')) currentEvent.dtend = trimmed;
        if (trimmed.startsWith('RRULE:')) currentEvent.rrule = trimmed.slice(6);
        if (trimmed.startsWith('RECURRENCE-ID')) currentEvent.recurrenceId = trimmed;
        if (trimmed.startsWith('EXDATE')) currentEvent.exdate = (currentEvent.exdate || []).concat(trimmed);
        if (trimmed.startsWith('UID:')) currentEvent.uid = trimmed.slice(4);
      }
    }
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({ 
      totalEvents: events.length,
      events: events.map(e => ({
        summary: e.summary,
        dtstart: e.dtstart,
        dtend: e.dtend,
        rrule: e.rrule || null,
        recurrenceId: e.recurrenceId || null,
        exdate: e.exdate || null,
        uid: e.uid
      }))
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
