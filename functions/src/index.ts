/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { onRequest } from 'firebase-functions/v2/https';
import admin from 'firebase-admin';
import { getStorage } from 'firebase-admin/storage';
import OpenAIApi from 'openai';
import express from 'express';
import { initializeApp } from 'firebase-admin/app';
import { defineSecret } from 'firebase-functions/params';
import { onInit } from 'firebase-functions';
import { Chat } from 'openai/resources';
import ChatCompletion = Chat.ChatCompletion;

initializeApp({
  credential: admin.credential.cert( 'pillowtime-5cbd6-adminsdk.json'),
  storageBucket: 'pillowtime-5cbd6.appspot.com',
});


const openAiApiKey = defineSecret('OPEN_AI_API_KEY');
let openAi: OpenAIApi;
onInit(() => {
  openAi = new OpenAIApi({ apiKey: openAiApiKey.value() });
});

export const generateAudioFromPrompt = onRequest({ secrets: [openAiApiKey] }, async (request, response) => {
  const prompt = request.body.prompt as string;
  try {
    const openAPIResponse: ChatCompletion = await openAi.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { 'role': 'system', 'content': 'You are a bedtime story teller. Be as calming as possible' },
        { 'role': 'user', 'content': `${prompt}` },
      ],
      max_tokens: 500,
      n: 1,
      temperature: 0.2,
    });
    console.log(openAPIResponse, 'response data');
    if (openAPIResponse.choices.length > 0) {
      const generatedText = openAPIResponse.choices[0].message?.content?.trim() ?? '';
      if (generatedText.length < 1) {
        response.send('No text generated');
        return;
      }
      console.log(`GENERATED: ${generatedText}`);
      await requestAudioFromText('alloy', generatedText, response);
    } else {
      response.status(500).send('No choices available');
    }
  } catch (error) {
    console.error('OpenAI API request failed:', error);
    response.status(500).send('Open API Request failed');
  }
});

async function requestAudioFromText(
  voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
  input: string,
  response: express.Response,
) {
  try {
    const audioFile = await openAi.audio.speech.create({
      model: 'tts-1',
      voice,
      input,
    });
    const buffer = Buffer.from(await audioFile.arrayBuffer());
    const bucket = getStorage().bucket();

    await bucket
      .file('test.mp3')
      .save(buffer, {
        contentType: 'audio/mpeg',
        timeout: 3000,
      })
      .then(() => response.send('success'))
      .catch((err: any) => {
        console.error('Upload bad!', err);
        response.status(500).send('Something went wrong!');
      });
  } catch (error) {
    console.error('OpenAI API request failed:', error);
    response.status(500).send('Open API Request failed');
  }
}

export const createAudioFromText = onRequest({ secrets: [openAiApiKey] }, async (request, response) => {
  const {
    voice,
    input,
  }: {
    voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
    input: string;
  } = request.body;
  await requestAudioFromText(voice, input, response);
});
