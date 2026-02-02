let mediaRecorder;
let audioBlob;
let jobName;

// --- NEW GLOBAL STATE FOR AI FEATURES ---
let originalTranscript = ""; 
let speakerMap = {}; 

const UPLOAD_API = "https://nb541tjjxd.execute-api.ap-southeast-1.amazonaws.com/Prod/upload"; 
const STATUS_API = "https://nb541tjjxd.execute-api.ap-southeast-1.amazonaws.com/Prod/status";

// Get references to buttons and containers
const recordButton = document.getElementById('recordButton');
const stopButton = document.getElementById('stopButton');
const uploadButton = document.getElementById('uploadButton');
const statusButton = document.getElementById('statusButton');
const outputElement = document.getElementById('output');
const playerElement = document.getElementById('player');

// --- UI STATE MANAGEMENT ---

function setUIState(state) {
    recordButton.disabled = true;
    stopButton.disabled = true;
    uploadButton.style.display = 'none'; 
    statusButton.disabled = true;

    switch (state) {
        case 'IDLE':
            recordButton.disabled = false;
            outputElement.textContent = "Click 'Record' to begin capturing audio for transcription.";
            break;
        case 'RECORDING':
            stopButton.disabled = false;
            outputElement.textContent = "Recording... Click 'Stop' when finished.";
            break;
        case 'RECORDED':
            recordButton.disabled = false;
            uploadButton.style.display = 'inline-block';
            outputElement.textContent = `Recording stopped. Audio ready for upload.`;
            break;
        case 'UPLOADING':
            uploadButton.style.display = 'inline-block';
            uploadButton.disabled = true;
            outputElement.textContent = "Uploading... please wait.";
            break;
        case 'TRANSCRIPTION_QUEUED':
            statusButton.disabled = false;
            outputElement.textContent = `Upload complete. Job: ${jobName}. Click 'Get Transcription' to check status.`;
            break;
        case 'FETCHING_STATUS':
            statusButton.disabled = true;
            outputElement.textContent = `Checking status for job: ${jobName}...`;
            break;
        case 'COMPLETE':
            statusButton.disabled = false;
            break;
    }
}

// --- CORE FUNCTIONS (RECORD/UPLOAD) ---

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

async function start() {
    setUIState('RECORDING');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        let chunks = [];
        mediaRecorder.ondataavailable = e => chunks.push(e.data);
        mediaRecorder.onstop = () => {
            audioBlob = new Blob(chunks, { type: "audio/wav" });
            playerElement.src = URL.createObjectURL(audioBlob);
            stream.getTracks().forEach(track => track.stop());
            setUIState('RECORDED');
        };
        mediaRecorder.start();
    } catch (error) {
        setUIState('IDLE');
    }
}

function stop() {
    if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
}

async function upload() {
    if (!audioBlob) return;
    setUIState('UPLOADING');
    try {
        const arrayBuffer = await audioBlob.arrayBuffer();
        const base64Audio = arrayBufferToBase64(arrayBuffer); 
        const res = await fetch(UPLOAD_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audio: base64Audio })
        });
        const data = await res.json();
        jobName = data.jobName;
        setUIState('TRANSCRIPTION_QUEUED');
    } catch (err) {
        setUIState('RECORDED');
    }
}

// --- UPDATED GET TRANSCRIPT (WITH SPEAKER & TODO LOGIC) ---

async function getTranscript() {
    if (!jobName) return;
    setUIState('FETCHING_STATUS');

    try {
        const url = `${STATUS_API}?job=${jobName}`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.status === "COMPLETED") {
            // Store results in global variables
            originalTranscript = data.text;
            
            // 1. Show the Transcript
            outputElement.textContent = originalTranscript;
            
            // 2. Handle To-Do List (from Bedrock)
            const todoOutput = document.getElementById('todoOutput');
            const todoBtn = document.getElementById('todoBtn');
            if (data.todo_list) {
                todoOutput.textContent = data.todo_list;
                todoBtn.style.display = 'inline-block'; // Show the button
            }

            // 3. Generate Speaker Name Inputs
            setupSpeakerNaming(originalTranscript);
            
            setUIState('COMPLETE');
        } else if (data.status === "FAILED") {
            outputElement.textContent = "Job Failed.";
            setUIState('COMPLETE');
        } else {
            outputElement.textContent = `Job Status: ${data.status}. Try again in a moment.`;
            setUIState('TRANSCRIPTION_QUEUED');
        }
    } catch (err) {
        setUIState('TRANSCRIPTION_QUEUED');
    }
}

// --- NEW HELPER FUNCTIONS FOR SPEAKER RENAMING ---

function setupSpeakerNaming(text) {
    // Find all unique "spk_0", "spk_1", etc. using Regex
    const labels = [...new Set(text.match(/spk_\d+/g))];
    const container = document.getElementById('speakerInputs');
    const section = document.getElementById('speakerAssignmentSection');

    if (labels.length > 0) {
        section.style.display = 'block';
        container.innerHTML = ""; // Clear previous inputs
        
        labels.forEach(label => {
            // Default mapping is the ID itself until changed
            speakerMap[label] = label; 

            container.innerHTML += `
                <div style="margin-bottom: 10px;">
                    <label style="font-weight: bold;">${label}: </label>
                    <input type="text" placeholder="Enter name..." 
                           oninput="renameSpeaker('${label}', this.value)" 
                           style="padding: 5px; border-radius: 4px; border: 1px solid #ccc;">
                </div>`;
        });
    }
}

function renameSpeaker(id, newName) {
    // Update the map (fall back to ID if input is empty)
    speakerMap[id] = newName.trim() || id;
    
    // Start with the original text and replace all keys
    let updatedText = originalTranscript;
    for (const [key, value] of Object.entries(speakerMap)) {
        const regex = new RegExp(key, 'g');
        updatedText = updatedText.replace(regex, value.toUpperCase());
    }
    
    outputElement.textContent = updatedText;
}

function toggleTodo() {
    const container = document.getElementById('todoContainer');
    container.style.display = container.style.display === 'none' ? 'block' : 'none';
}

window.onload = () => setUIState('IDLE');