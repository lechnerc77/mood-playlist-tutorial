# Sample Azure Function - Mood Playlist

This project contains a sample HTTP triggered Azure Function that executed the following tasks:

- Extracting the emotions based on image via Azure Cognitive Services Face API (image must be passed via URL)
- Searching a playlist based on the predominant emotion on Spotify
- Sending an email to the caller with the link to the playlist