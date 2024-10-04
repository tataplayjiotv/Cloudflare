addEventListener("fetch", event => {
    event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/src/mpd.worker.js") {
        const id = url.searchParams.get("id");
        const otherParam = url.searchParams.get("1"); // Assuming you want to capture the second parameter
        return new Response(`Handling mpd.worker.js with id: ${id} and param: ${otherParam}`, {
            headers: { "Content-Type": "text/plain" },
        });
    } else if (path === "/src/playlist-worker.js") {
        return new Response("Handling playlist-worker.js", {
            headers: { "Content-Type": "text/plain" },
        });
    }

    return new Response("Not Found", { status: 404 });
}
