let mediaRecorder;
let audioBlob;
let jobName;

const UPLOAD_API = "https://82wg3untji.execute-api.ap-southeast-1.amazonaws.com/Prod/upload";
const STATUS_API = "https://82wg3untji.execute-api.ap-southeast-1.amazonaws.com/Prod/status";
const BUCKET_URL = "https://smartboard-transcription-audiobucket-48yujmy9fgrh.s3.amazonaws.com/";

async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    let chunks = [];

    mediaRecorder.ondataavailable = e => chunks.push(e.data);
    mediaRecorder.onstop = () => {
        audioBlob = new Blob(chunks, { type: 'audio/webm' });
        chunks = []; // reset for next recording
        document.getElementById("output").textContent = "Recording stopped, ready to upload.";

        // Play the recorded audio
        const player = document.getElementById("player");
        player.src = URL.createObjectURL(audioBlob);
        player.play();
    };

    mediaRecorder.start();
    document.getElementById("output").textContent = "Recording...";
}

async function upload() {
    if (!audioBlob) {
        document.getElementById("output").textContent = "No audio to upload!";
        return;
    }

    const fileName = `audio-${Date.now()}.webm`;

    const formData = new FormData();
    formData.append("filename", fileName);
    formData.append("file", audioBlob);

    try {
        const res = await fetch(`${UPLOAD_API}?filename=${fileName}`, {
            method: "POST",
            body: formData
        });
        const data = await res.json();
        jobName = data.job_name; // ensure matches your Lambda return
        document.getElementById("output").textContent = "Uploaded. Job started.";
    } catch (err) {
        console.error(err);
        document.getElementById("output").textContent = "Upload failed.";
    }
}

async function getTranscript() {
    if (!jobName) {
        document.getElementById("output").textContent = "No job yet!";
        return;
    }

    const res = await fetch(`${STATUS_API}?job=${jobName}`);
    const data = await res.json();
    document.getElementById("output").textContent =
        data.text || data.status;
}

