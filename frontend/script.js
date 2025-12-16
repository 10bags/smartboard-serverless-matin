let mediaRecorder;
let audioBlob;
let jobName;

const UPLOAD_API = "https://nb541tjjxd.execute-api.ap-southeast-1.amazonaws.com/Prod/upload"; 
const STATUS_API = "https://nb541tjjxd.execute-api.ap-southeast-1.amazonaws.com/Prod/status";

// Get references to buttons
const recordButton = document.getElementById('recordButton');
const stopButton = document.getElementById('stopButton');
const uploadButton = document.getElementById('uploadButton');
const statusButton = document.getElementById('statusButton');
const outputElement = document.getElementById('output');
const playerElement = document.getElementById('player');

// --- UI STATE MANAGEMENT ---

function setUIState(state) {
    // Reset all
    recordButton.disabled = true;
    stopButton.disabled = true;
    uploadButton.style.display = 'none'; // Hide by default
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
            uploadButton.style.display = 'inline-block'; // Show upload button
            outputElement.textContent = `Recording stopped. Audio ready for upload. Size: ${audioBlob.size} bytes.`;
            break;
        case 'UPLOADING':
            uploadButton.style.display = 'inline-block';
            uploadButton.disabled = true;
            outputElement.textContent = "Uploading... please wait.";
            break;
        case 'TRANSCRIPTION_QUEUED':
            statusButton.disabled = false;
            outputElement.textContent = `Upload complete. Transcription Job Name: ${jobName}. Click 'Get Transcription' to check status.`;
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

// Helper function for safe ArrayBuffer to Base64 conversion
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// --- CORE FUNCTIONS ---

async function start() {
    setUIState('RECORDING');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        let chunks = [];

        mediaRecorder.ondataavailable = e => chunks.push(e.data);

        mediaRecorder.onstop = () => {
            audioBlob = new Blob(chunks, { type: "audio/wav" });
            chunks = [];

            playerElement.src = URL.createObjectURL(audioBlob);
            
            // Stop tracks to release microphone access
            stream.getTracks().forEach(track => track.stop());
            
            setUIState('RECORDED');
        };

        mediaRecorder.start();
    } catch (error) {
        console.error("Microphone access denied or failed:", error);
        outputElement.textContent = "Error: Could not access microphone. Check permissions.";
        setUIState('IDLE');
    }
}

function stop() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        // The UI state change happens inside mediaRecorder.onstop
    }
}

async function upload() {
    if (!audioBlob) {
        setUIState('IDLE');
        return;
    }

    setUIState('UPLOADING');
    
    try {
        const arrayBuffer = await audioBlob.arrayBuffer();
        const base64Audio = arrayBufferToBase64(arrayBuffer); 

        const res = await fetch(UPLOAD_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audio: base64Audio })
        });

        if (!res.ok) {
             throw new Error(`API returned status ${res.status}`);
        }

        const data = await res.json();
        jobName = data.jobName;
        setUIState('TRANSCRIPTION_QUEUED');
    } catch (err) {
        console.error("Upload failed:", err);
        outputElement.textContent = `Upload failed: ${err.message}. Check console for details.`;
        setUIState('RECORDED'); // Allow re-upload attempt
    }
}

async function getTranscript() {
    if (!jobName) {
        outputElement.textContent = "No transcription job running! Please record and upload first.";
        setUIState('IDLE');
        return;
    }

    setUIState('FETCHING_STATUS');

    try {
        const url = `${STATUS_API}?job=${jobName}`;
        const res = await fetch(url);

        if (!res.ok) {
             throw new Error(`API returned status ${res.status}`);
        }
        
        const data = await res.json();
        
        if (data.status === "COMPLETED") {
            outputElement.textContent = "TRANSCRIPTION COMPLETE:\n\n" + data.text;
            setUIState('COMPLETE');
        } else if (data.status === "FAILED") {
            outputElement.textContent = `TRANSCRIPTION FAILED: The job status is ${data.status}. Reason: ${data.text || 'Check AWS Transcribe Console for details.'}`;
            setUIState('COMPLETE');
        } else {
            // Still IN_PROGRESS or QUEUED
            outputElement.textContent = `Job Status: ${data.status}. Click 'Get Transcription' again in a few seconds.`;
            setUIState('TRANSCRIPTION_QUEUED'); // Re-enable the status button
        }

    } catch (err) {
        console.error("Failed to fetch transcription:", err);
        outputElement.textContent = "Failed to fetch transcription. Check console for error details.";
        setUIState('TRANSCRIPTION_QUEUED'); // Allow re-check
    }
}

// Initialize the UI state when the page loads
window.onload = () => setUIState('IDLE');