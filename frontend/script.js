let mediaRecorder;
let audioBlob;
let jobName;

const UPLOAD_API = "https://nb541tjjxd.execute-api.ap-southeast-1.amazonaws.com/Prod/upload";
const STATUS_API = "https://nb541tjjxd.execute-api.ap-southeast-1.amazonaws.com/Prod/status";

// Get references to buttons and new elements
const recordButton = document.getElementById('recordButton');
const stopButton = document.getElementById('stopButton');
const uploadButton = document.getElementById('uploadButton');
const statusButton = document.getElementById('statusButton');
const outputElement = document.getElementById('output');
const playerElement = document.getElementById('player');

// New elements for progress and date
const progressBar = document.getElementById('progressBar');
const meetingDatetime = document.getElementById('meetingDatetime');

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

// --- UI STATE MANAGEMENT WITH PROGRESS BAR ---

function setProgress(percent, text = `${percent}%`) {
    progressBar.style.width = `${percent}%`;
    progressBar.textContent = text;
    progressBar.setAttribute('aria-valuenow', percent);
}

function setUIState(state) {
    // Reset all
    recordButton.disabled = true;
    stopButton.disabled = true;
    uploadButton.style.display = 'none';
    statusButton.disabled = true;

    // Remove status classes to allow fresh application
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
            outputElement.textContent = `Recording stopped. Audio ready for upload. Size: ${audioBlob.size} bytes.`;
            setProgress(25, "Ready to Upload");
            break;
        case 'UPLOADING':
            uploadButton.style.display = 'inline-block';
            uploadButton.disabled = true;
            outputElement.textContent = "Uploading audio to S3 and starting Transcribe job...";
            setProgress(50, "Uploading...");
            break;
        case 'TRANSCRIPTION_QUEUED':
            statusButton.disabled = false;
            outputElement.textContent = `Upload complete. Job: ${jobName}. Click 'Get Status' to check transcription/translation progress.`;
            setProgress(75, "Transcription Queued");
            break;
        case 'FETCHING_STATUS':
            statusButton.disabled = true;
            outputElement.textContent = `Checking status for job: ${jobName}... This may take a few seconds.`;
            setProgress(90, "Checking Status...");
            break;
        case 'COMPLETE':
            statusButton.disabled = false;
            setProgress(100, "Complete!");
            outputElement.classList.add('output-success');
            break;
    }
}

// --- CORE FUNCTIONS (kept identical for brevity) ---

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
        outputElement.textContent = `Upload failed: ${err.message}. Please try recording again.`;
        setUIState('RECORDED');
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
            const translatedText = data.text || "N/A";
            const rawText = data.raw_text || "N/A";

            outputElement.innerHTML =
                `<strong>TRANSCRIPTION COMPLETE:</strong><br><br>` +
                `<strong style="color: var(--primary-color);">English Translation:</strong><br>${translatedText}<br><br>` +
                `<strong style="color: var(--text-dark);">Original Mandarin:</strong><br>${rawText}`;

            setUIState('COMPLETE');
        } else if (data.status === "FAILED") {
            outputElement.textContent = `TRANSCRIPTION FAILED: The job status is ${data.status}. Reason: ${data.text || 'Check AWS Transcribe Console for details.'}`;
            outputElement.classList.add('output-error');
            setUIState('COMPLETE');
        } else {
            // Still IN_PROGRESS or QUEUED
            outputElement.textContent = `Job Status: ${data.status}. Click 'Get Status' again in a few seconds.`;
            setUIState('TRANSCRIPTION_QUEUED'); // Re-enable the status button
        }

    } catch (err) {
        console.error("Failed to fetch transcription:", err);
        outputElement.textContent = "Failed to fetch transcription. Check console for error details.";
        setUIState('TRANSCRIPTION_QUEUED'); // Allow re-check
    }
}

// Function to set current date and time
function setMeetingDateTime() {
    const now = new Date();
    // Example: December 17, 2025 at 4:10:06 AM SGT
    const options = {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
    };

    meetingDatetime.textContent = `Date: ${now.toLocaleDateString(undefined, options)}`;
}

// Initialize the UI state when the page loads
window.onload = () => {
    // Set current date and time
    setMeetingDateTime();

    // Set initial UI state
    setUIState('IDLE');
};