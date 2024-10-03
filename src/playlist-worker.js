addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const jsonResponse = await fetch('https://raw.githubusercontent.com/ttoor5/tataplay_urls/main/origin.json');
  
  if (!jsonResponse.ok) {
    return new Response('Internal Server Error', { status: 500 });
  }

  const channels = await jsonResponse.json();
  const serverAddress = request.headers.get('host') || 'default.server.address';
  const serverScheme = request.headers.get('x-forwarded-proto') || 'http';
  const m3u8PlaylistFile = generateM3UPlaylist(channels, serverAddress);

  const headers = new Headers();
  headers.set('Cache-Control', 'max-age=84000, public');
  headers.set('Content-Type', 'audio/x-mpegurl');
  headers.set('Content-Disposition', 'attachment; filename="playlist.m3u"');

  return new Response(m3u8PlaylistFile, { headers });
}

function generateM3UPlaylist(channels, serverAddress) {
  let m3u8PlaylistFile = '#EXTM3U x-tvg-url="https://www.tsepg.cf/epg.xml.gz"\n';
  
  for (const channel of channels) {
    const id = channel.id;
    const dashUrl = channel.streamData?.['MPD='];
    if (!dashUrl) continue;

    const extension = dashUrl.split('.').pop();
    const playlistUrl = `https://${serverAddress}/${id}.${extension}|X-Forwarded-For=59.178.72.184`;

    m3u8PlaylistFile += `#EXTINF:-1 tvg-id="${id}" tvg-country="IN" catchup-days="7" tvg-logo="https://mediaready.videoready.tv/tatasky-epg/image/fetch/f_auto,fl_lossy,q_auto,h_250,w_250/${channel.channel_logo}" group-title="${channel.channel_genre[0]}",${channel.channel_name}\n`;
    m3u8PlaylistFile += `#KODIPROP:inputstream.adaptive.license_type=clearkey\n`;
    m3u8PlaylistFile += `#KODIPROP:inputstream.adaptive.license_key=https://tpck.drmlive-01.workers.dev/?id=${id}\n`;
    m3u8PlaylistFile += `#EXTVLCOPT:http-user-agent=third-party\n`;
    m3u8PlaylistFile += `${playlistUrl}\n\n`;
  }
  
  return m3u8PlaylistFile;
}
