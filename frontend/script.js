let mediaRecorder;
let audioBlob;
let jobName;

const UPLOAD_API = "PASTE_UPLOAD_API_HERE";
const STATUS_API = "PASTE_STATUS_API_HERE";
const BUCKET_URL = "https://YOUR_BUCKET_NAME.s3.amazonaws.com/";

async function start() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  let chunks = [];

  mediaRecorder.ondataavailable = e => chunks.push(e.data);
  mediaRecorder.onstop = () => audioBlob = new Blob(chunks, { type: 'audio/webm' });

  mediaRecorder.start();
}

function stop() {
  mediaRecorder.stop();
}

async function upload() {
  const fileName = `audio-${Date.now()}.webm`;

  await fetch(BUCKET_URL + fileName, {
    method: "PUT",
    body: audioBlob
  });

  const res = await fetch(UPLOAD_API, {
    method: "POST",
    body: JSON.stringify({ filename: fileName })
  });

  const data = await res.json();
  jobName = data.jobName;

  document.getElementById("output").textContent = "Uploaded. Job started.";
}

async function getTranscript() {
  const res = await fetch(`${STATUS_API}?job=${jobName}`);
  const data = await res.json();

  document.getElementById("output").textContent =
    data.text || data.status;
}
