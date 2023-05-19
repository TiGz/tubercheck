// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from '../_shared/cors.ts'
import { DOMParser } from 'https://deno.land/x/deno_dom/deno-dom-wasm.ts';
import { OpenAI } from "https://deno.land/x/openai/mod.ts";

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;
const TRANSCRIPT_PROVIDER = Deno.env.get('TRANSCRIPT_PROVIDER')!;
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL')!;
const MAX_TRANSCRIPT_LENGTH = Deno.env.get('MAX_TRANSCRIPT_LENGTH')!;

console.log ("OPENAI_API_KEY:", OPENAI_API_KEY);
const openAI = new OpenAI(OPENAI_API_KEY);

console.log("Hello from Functions!")

serve(async (req) => {

  // This is needed if you're planning to invoke your function from a browser.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
      const json = await req.json();

      const videoUrl = json.url;
    
      console.log("About to get video transcript for video Url:", videoUrl);
    
      var transcript = await getCaptions(videoUrl);
      transcript = clipTranscript(transcript);
    
      console.log("About to return response with transcript:", transcript);
    
      const chatCompletion = await openAI.createChatCompletion({
        model: OPENAI_MODEL,
        temperature: 0,
        messages: [
          { "role": "system", "content": "Imagine you are a parent of an impressionable tween. I am going to provide the transcript of a youtube video and I want you to review the content and provide the following bits of information formatted as a json object a) summary: a brief summary of the content b) bad_language: a number from 0 to 10 where 0 means the transcript contains no swearing at all and 10 is a lot of really bad swearing c) sexual_content: a number from 0 to 10 where 0 is no sexual content at all and 10 is loads of sexual content d) coercion: a number from 0 to 10 indicating how much coercion occurred (i.e. the host is trying to get the viewer to do something in particular) e) min_age_rating: the minimum age of a child that should be watching such a video f) notes: an array containing any interesting or weird things that might be of interest to a parent. Transcript follows. IMPORTANT: your response must be a JSON string." },
          { "role": "assistant", "content": transcript },
        ],
      });
    
      console.log("About to return response with chat completion:", chatCompletion);
    
      const content = chatCompletion.choices[0].message.content;

    return new Response(content, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

function clipTranscript(transcript: string): string {
  console.log("*** Transcript length:", transcript.length);
  if ( transcript.length <= MAX_TRANSCRIPT_LENGTH ) {
    return transcript;
  }
  console.log("*** Transcript is too long, clipping to:", MAX_TRANSCRIPT_LENGTH);
  return transcript.substring(0, MAX_TRANSCRIPT_LENGTH);
}

async function getCaptions(videoUrl: string): Promise<string> {
  if (TRANSCRIPT_PROVIDER === 'captionsgrabber') {
    return getCaptionsFromCaptionsGrabber(videoUrl);
  } else {
    return getCaptionsFromYoutubeTranscript(videoUrl);
  }
}

async function getCaptionsFromYoutubeTranscript(videoUrl: string): Promise<string> {
  console.log("About to extract video ID from url:", videoUrl);

  // Call the YouTube Data API to get the video transcript
  const videoId = extractVideoId(videoUrl);

  const url = `https://youtubetranscript.com/?server_vid=${videoId}`;

  console.log("About to fetch captions from:", url);

  const response = await fetch(url);

  console.log("About to parse response as text");

  const html = await response.text();

  console.log("About to parse transcript response", html);

  return parseXmlResponse(html);
}

async function parseXmlResponse(xmlResponse: string): Promise<string> {
  const domparser = new DOMParser();
  const doc = domparser.parseFromString(xmlResponse, 'text/html');
  
  let texts = doc.getElementsByTagName("text");

  let result = "";

  for(let i = 0; i < texts.length; i++) {
      let textContent = texts[i].textContent || "";

      // Replace HTML special characters
      textContent = textContent.replace(/&apos;/g, "'")
                               .replace(/&quot;/g, '"')
                               .replace(/&gt;/g, '>')
                               .replace(/&lt;/g, '<')
                               .replace(/&amp;/g, '&');

      result += textContent + " ";
  }

  console.log("About to return result:", result);

  return result.trim();
}

async function getCaptionsFromCaptionsGrabber(videoUrl: string): Promise<string> {
  console.log("About to extract video ID from url:", videoUrl);

  // Call the YouTube Data API to get the video transcript
  const videoId = extractVideoId(videoUrl);

  const url = `https://www.captionsgrabber.com/8302/get-captions.00.php?id=${videoId}`;

  console.log("About to fetch captions from:", url);

  const response = await fetch(url);

  //console.log("About to parse response as text");

  const html = await response.text();

  //console.log("About to parse HTML", html);

  const parser = new DOMParser();
  const document = parser.parseFromString(html, 'text/html');

  const textElement = document.getElementById('text');
  if (!textElement) {
    throw new Error('Text element not found on the page');
  }

  const text = removeNewLines(textElement.textContent || '');

  return text;
}

// Extract the YouTube video ID from the URL
function extractVideoId(url: string) {
  const videoIdRegex = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^?&]+)/;
  const matches = url.match(videoIdRegex);
  return matches ? matches[1] : null;
}

function removeNewLines(text: string): string {
  return text.replace(/(\r\n|\n|\r)/gm, '');
}

// To invoke:
// curl -i --location --request POST 'http://localhost:54321/functions/v1/' \
//   --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
//   --header 'Content-Type: application/json' \
//   --data '{"name":"Functions"}'
