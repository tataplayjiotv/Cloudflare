addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return new Response('ID parameter is missing', { status: 400 });

    const userAgent = request.headers.get('User-Agent');
    const utc = url.searchParams.get('utc');
    const lutc = url.searchParams.get('lutc');
    const begin = utc ? new Date(parseInt(utc) * 1000).toISOString().replace(/[:-]/g, '').split('.')[0] + 'Z' : 'unknown';
    const end = lutc ? new Date(parseInt(lutc) * 1000).toISOString().replace(/[:-]/g, '').split('.')[0] + 'Z' : 'unknown';

    // Fetch channel information
    const channelInfo = await getChannelInfo(id);
    if (!channelInfo) return new Response('Channel not found', { status: 404 });

    let dashUrl = channelInfo.streamData["MPD="];
    if (!dashUrl.startsWith('https://bpprod')) {
        return Response.redirect(dashUrl, 302); // Redirect if not the right domain
    }

    // Add timestamps if applicable
    if (utc) {
        dashUrl = dashUrl.replace('master', 'manifest');
        dashUrl += `?begin=${begin}&end=${end}`;
    }

    // Fetch MPD Manifest
    const manifestContent = await fetchMPDManifest(dashUrl, userAgent);
    if (!manifestContent) return new Response('Failed to fetch MPD manifest', { status: 500 });

    // Extract Widevine PSSH from the manifest
    const widevinePssh = await extractPsshFromManifest(manifestContent, dashUrl, userAgent);
    let processedManifest = manifestContent.replace('dash/', `${new URL(dashUrl).origin}/dash/`);

    // Add Widevine PSSH to manifest if found
    if (widevinePssh) {
        processedManifest = processedManifest.replace(
            '<ContentProtection value="cenc" schemeIdUri="urn:mpeg:dash:mp4protection:2011"/>',
            `<ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc" cenc:default_KID="${widevinePssh.kid}"></ContentProtection>`
        ).replace(
            '<ContentProtection schemeIdUri="urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95" value="PlayReady"/>',
            `<ContentProtection schemeIdUri="urn:uuid:EDEF8BA9-79D6-4ACE-A3C8-27DCD51D21ED"><cenc:pssh>${widevinePssh.pssh}</cenc:pssh></ContentProtection>`
        );
    }

    // Modify bandwidth and resolution for specific channels
    if (['244', '599'].includes(id)) {
        processedManifest = processedManifest.replace(
            'minBandwidth="226400" maxBandwidth="3187600" maxWidth="1920" maxHeight="1080"',
            'minBandwidth="226400" maxBandwidth="2452400" maxWidth="1280" maxHeight="720"'
        );
        processedManifest = processedManifest.replace(/<Representation id="video=3187600".*?<\/Representation>/s, '');
    }

    // Return processed manifest with headers
    return new Response(processedManifest, {
        headers: {
            'Content-Type': 'application/dash+xml',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'max-age=20, public',
            'Content-Disposition': `attachment; filename="script_by_drmlive_${encodeURIComponent(id)}.mpd"`
        }
    });
}

async function getChannelInfo(id) {
    const response = await fetch('https://raw.githubusercontent.com/ttoor5/tataplay_urls/main/origin.json');
    const channels = await response.json();
    return channels.find(channel => channel.id === id) || null;
}

async function fetchMPDManifest(url, userAgent) {
    const response = await fetch(url, {
        headers: { 'User-Agent': userAgent }
    });
    return response.ok ? await response.text() : null;
}

async function extractPsshFromManifest(manifestContent, baseUrl, userAgent) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(manifestContent, "application/xml");
    
    const adaptationSets = xmlDoc.getElementsByTagName('AdaptationSet');
    for (let adaptationSet of adaptationSets) {
        if (adaptationSet.getAttribute('contentType') === 'audio') {
            const representations = adaptationSet.getElementsByTagName('Representation');
            for (let rep of representations) {
                const segmentTemplate = rep.getElementsByTagName('SegmentTemplate')[0];
                if (segmentTemplate) {
                    const media = segmentTemplate.getAttribute('media')
                        .replace('$RepresentationID$', rep.getAttribute('id'))
                        .replace('$Number$', '1'); // Adjust the start number if needed

                    const response = await fetch(`${baseUrl}/dash/${media}`, {
                        headers: { 'User-Agent': userAgent }
                    });
                    const binaryContent = await response.arrayBuffer();
                    const hexContent = Array.from(new Uint8Array(binaryContent)).map(b => b.toString(16).padStart(2, '0')).join('');
                    
                    return extractKid(hexContent);
                }
            }
        }
    }
    return null;
}

function extractKid(hexContent) {
    const psshMarker = "70737368";
    const psshOffset = hexContent.indexOf(psshMarker);
    
    if (psshOffset !== -1) {
        const headerSizeHex = hexContent.slice(psshOffset - 8, psshOffset);
        const headerSize = parseInt(headerSizeHex, 16);
        const psshHex = hexContent.slice(psshOffset - 8, psshOffset + headerSize * 2);
        const kidHex = psshHex.slice(68, 68 + 32);
        const newPsshHex = `000000327073736800000000edef8ba979d64acea3c827dcd51d21ed000000121210${kidHex}`;
        const pssh = btoa(String.fromCharCode(...hexToBytes(newPsshHex)));
        const kid = `${kidHex.slice(0, 8)}-${kidHex.slice(8, 12)}-${kidHex.slice(12, 16)}-${kidHex.slice(16, 20)}-${kidHex.slice(20)}`;

        return { pssh, kid };
    }
    return null;
}

function hexToBytes(hex) {
    const bytes = [];
    for (let c = 0; c < hex.length; c += 2) {
        bytes.push(parseInt(hex.substr(c, 2), 16));
    }
    return bytes;
                      }
