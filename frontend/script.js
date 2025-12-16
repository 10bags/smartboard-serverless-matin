let mediaRecorder;
let audioBlob;
let jobName;

// !! REMEMBER TO REPLACE THESE WITH YOUR DEPLOYMENT OUTPUTS !!
const UPLOAD_API = "https://nb541tjjxd.execute-api.ap-southeast-1.amazonaws.com/Prod/upload"; 
const STATUS_API = "https://nb541tjjxd.execute-api.ap-southeast-1.amazonaws.com/Prod/status";

// Helper function to safely convert ArrayBuffer (binary data) to Base64
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

async function start() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Use MediaRecorder options for better compatibility/quality if needed, 
        // but 'audio/wav' is fine for this example.
        mediaRecorder = new MediaRecorder(stream);
        let chunks = [];

        mediaRecorder.ondataavailable = e => chunks.push(e.data);

        mediaRecorder.onstop = () => {
            // NOTE: Changing Blob type to 'audio/wav' to be explicit for the backend
            audioBlob = new Blob(chunks, { type: "audio/wav" }); 
            chunks = [];

            const player = document.getElementById("player");
            player.src = URL.createObjectURL(audioBlob);

            document.getElementById("output").textContent =
                `Recording stopped. Audio size: ${audioBlob.size} bytes. Ready to upload.`;
            
            // Stop tracks to release microphone access
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        document.getElementById("output").textContent = "Recording...";
    } catch (error) {
        console.error("Microphone access denied or failed:", error);
        document.getElementById("output").textContent = "Error: Could not access microphone. Check permissions.";
    }
}

function stop() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
}

async function upload() {
    if (!audioBlob) {
        document.getElementById("output").textContent = "No audio to upload! Please record first.";
        return;
    }

    document.getElementById("output").textContent = "Uploading... please wait.";

    try {
        const arrayBuffer = await audioBlob.arrayBuffer();
        // **CRITICAL FIX**: Using the safer conversion function
        const base64Audio = arrayBufferToBase64(arrayBuffer); 

        const res = await fetch(UPLOAD_API, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json" 
                // CORS headers are configured on the API Gateway, not needed here
            },
            body: JSON.stringify({ audio: base64Audio })
        });

        if (!res.ok) {
             throw new Error(`API returned status ${res.status}`);
        }

        const data = await res.json();
        jobName = data.jobName;
        document.getElementById("output").textContent = `Upload complete. Transcription Job Name: ${jobName}. Polling for status...`;
    } catch (err) {
        console.error("Upload failed:", err);
        document.getElementById("output").textContent = `Upload failed: ${err.message}. Check console for details.`;
    }
}

async function getTranscript() {
    if (!jobName) {
        document.getElementById("output").textContent = "No transcription job running! Please record and upload first.";
        return;
    }

    document.getElementById("output").textContent = `Checking status for job: ${jobName}...`;

    try {
        const url = `${STATUS_API}?job=${jobName}`;
        const res = await fetch(url);

        if (!res.ok) {
             throw new Error(`API returned status ${res.status}`);
        }
        
        const data = await res.json();
        
        if (data.status === "COMPLETED") {
            document.getElementById("output").textContent = "TRANSCRIPTION COMPLETE:\n\n" + data.text;
        } else if (data.status === "FAILED") {
            document.getElementById("output").textContent = `TRANSCRIPTION FAILED: The job status is ${data.status}.`;
        }
        else {
            // Show status while waiting
            document.getElementById("output").textContent = `Job Status: ${data.status}. Click 'Get Transcription' again in a few seconds.`;
        }

    } catch (err) {
        console.error("Failed to fetch transcription:", err);
        document.getElementById("output").textContent = "Failed to fetch transcription. Check console for error details.";
    }
}