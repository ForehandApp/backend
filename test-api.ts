async function main() {
  try {
    const response = await fetch("http://localhost:8000/v1/match/assign-scorer/1e00a4ba-6898-4e22-a6a4-acec735ca4c6", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scorerId: "ee1ecd45-7678-429d-bc30-ad674b65720e"
      })
    });
    const data = await response.json();
    console.log("Status:", response.status);
    console.log("Response:", data);
  } catch(e) {
    console.error(e);
  }
}
main();
