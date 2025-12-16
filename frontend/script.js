let mediaRecorder;
let audioBlob;
let jobName;

const UPLOAD_API = "https://82wg3untji.execute-api.ap-southeast-1.amazonaws.com/Prod/upload";
const STATUS_API = "https://82wg3untji.execute-api.ap-southeast-1.amazonaws.com/Prod/status";

async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);

    let chunks = [];

    mediaRecorder.ondataavailable = e => chunks.push(e.data);

    mediaRecorder.onstop = () => {
        audioBlob = new Blob(chunks, { type: "audio/wav" });
        chunks = [];

        const player = document.getElementById("player");
        player.src = URL.createObjectURL(audioBlob);

        document.getElementById("output").textContent =
            `Recording stopped. Audio size: ${audioBlob.size} bytes`;
    };

    mediaRecorder.start();
    document.getElementById("output").textContent = "Recording...";
}

function stop() {
    if (mediaRecorder) {
        mediaRecorder.stop();
    }
}

async function upload() {
    if (!audioBlob) {
        document.getElementById("output").textContent = "No audio to upload!";
        return;
    }

    const arrayBuffer = await audioBlob.arrayBuffer();
    const base64Audio = btoa(
        String.fromCharCode(...new Uint8Array(arrayBuffer))
    );

    const res = await fetch(UPLOAD_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: base64Audio })
    });

    const data = await res.json();
    jobName = data.jobName;

    document.getElementById("output").textContent =
        "Uploaded. Transcription started.";
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
