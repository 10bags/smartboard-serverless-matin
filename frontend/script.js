let mediaRecorder;
let audioBlob;
let jobName;

// --- NEW GLOBAL STATE ---
let originalTranscript = ""; 
let speakerMap = {}; 

const UPLOAD_API = "https://nb541tjjxd.execute-api.ap-southeast-1.amazonaws.com/Prod/upload";
const STATUS_API = "https://nb541tjjxd.execute-api.ap-southeast-1.amazonaws.com/Prod/status";

const recordButton = document.getElementById('recordButton');
const stopButton = document.getElementById('stopButton');
const uploadButton = document.getElementById('uploadButton');
const statusButton = document.getElementById('statusButton');
const outputElement = document.getElementById('output');
const playerElement = document.getElementById('player');
const progressBar = document.getElementById('progressBar');
const meetingDatetime = document.getElementById('meetingDatetime');

// --- UI STATE MANAGEMENT ---

function setProgress(percent, text = `${percent}%`) {
    progressBar.style.width = `${percent}%`;
    progressBar.textContent = text;
    progressBar.setAttribute('aria-valuenow', percent);
}

function setUIState(state) {
    recordButton.disabled = true;
    stopButton.disabled = true;
    uploadButton.style.display = 'none';
    statusButton.disabled = true;
    outputElement.classList.remove('output-success', 'output-error');

    switch (state) {
        case 'IDLE':
            recordButton.disabled = false;
            outputElement.textContent = "Please record your voice before speaking";
            setProgress(0);
            break;
        case 'RECORDING':
            stopButton.disabled = false;
            outputElement.textContent = "Recording in progress... Click 'Stop' when finished.";
            setProgress(10, "Recording...");
            break;
        case 'RECORDED':
            recordButton.disabled = false;
            uploadButton.style.display = 'inline-block';
            outputElement.textContent = `Recording stopped. Audio ready for upload.`;
            setProgress(25, "Ready to Upload");
            break;
        case 'UPLOADING':
            uploadButton.style.display = 'inline-block';
            uploadButton.disabled = true;
            outputElement.textContent = "Uploading audio and starting Transcribe job...";
            setProgress(50, "Uploading...");
            break;
        case 'TRANSCRIPTION_QUEUED':
            statusButton.disabled = false;
            outputElement.textContent = `Upload complete. Job: ${jobName}. Click 'Get Status' to check progress.`;
            setProgress(75, "Transcription Queued");
            break;
        case 'FETCHING_STATUS':
            statusButton.disabled = true;
            outputElement.textContent = `Checking status for job: ${jobName}...`;
            setProgress(90, "Checking Status...");
            break;
        case 'COMPLETE':
            statusButton.disabled = false;
            setProgress(100, "Complete!");
            outputElement.classList.add('output-success');
            break;
    }
}

// --- CORE FUNCTIONS ---

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
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
        outputElement.textContent = "Error: Could not access microphone.";
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
        outputElement.textContent = `Upload failed: ${err.message}`;
        setUIState('RECORDED');
    }
}

// --- GET TRANSCRIPT WITH SPEAKER & TODO LOGIC ---

async function getTranscript() {
    if (!jobName) return;
    setUIState('FETCHING_STATUS');

    try {
        const url = `${STATUS_API}?job=${jobName}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.status === "COMPLETED") {
            // Save to global variable for renaming logic
            originalTranscript = data.text || "N/A";
            
            // 1. Display Transcription
            outputElement.innerHTML = `<strong>TRANSCRIPTION COMPLETE:</strong><br><br>${originalTranscript}`;

            // 2. Setup Speaker Inputs
            setupSpeakerNaming(originalTranscript);

            // 3. Setup To-Do List (from Bedrock)
            if (data.todo_list) {
                document.getElementById('todoOutput').textContent = data.todo_list;
                document.getElementById('todoBtn').style.display = 'block';
            }

            setUIState('COMPLETE');
        } else if (data.status === "FAILED") {
            outputElement.textContent = `FAILED: ${data.text}`;
            outputElement.classList.add('output-error');
            setUIState('COMPLETE');
        } else {
            outputElement.textContent = `Status: ${data.status}. Re-check in 5 seconds.`;
            setUIState('TRANSCRIPTION_QUEUED');
        }
    } catch (err) {
        setUIState('TRANSCRIPTION_QUEUED');
    }
}

// --- SPEAKER RENAMING HELPERS ---

function setupSpeakerNaming(text) {
    const labels = [...new Set(text.match(/spk_\d+/g))];
    const container = document.getElementById('speakerInputs');
    const section = document.getElementById('speakerAssignmentSection');

    if (labels.length > 0) {
        section.style.display = 'block';
        container.innerHTML = ""; 
        labels.forEach(label => {
            speakerMap[label] = label; // Initial mapping
            container.innerHTML += `
                <div style="flex: 1; min-width: 150px;">
                    <small style="color: #666;">${label}:</small><br>
                    <input type="text" placeholder="Assign Name" 
                           oninput="applyRenaming('${label}', this.value)" 
                           style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                </div>`;
        });
    }
}

function applyRenaming(id, newName) {
    speakerMap[id] = newName.trim() || id;
    let tempText = originalTranscript;
    
    // Replace all speaker IDs with names in bold uppercase
    for (const [key, value] of Object.entries(speakerMap)) {
        const regex = new RegExp(key, 'g');
        tempText = tempText.replace(regex, `<strong style="color: var(--primary-color);">${value.toUpperCase()}</strong>`);
    }
    
    outputElement.innerHTML = `<strong>TRANSCRIPTION COMPLETE:</strong><br><br>${tempText}`;
}

function toggleTodo() {
    const el = document.getElementById('todoContainer');
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function setMeetingDateTime() {
    const now = new Date();
    const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' };
    meetingDatetime.textContent = `Date: ${now.toLocaleDateString(undefined, options)}`;
}

window.onload = () => {
    setMeetingDateTime();
    setUIState('IDLE');
};