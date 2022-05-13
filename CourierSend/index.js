const { CourierClient } = require("@trycourier/courier")
const CognitiveServicesFace = require("@azure/cognitiveservices-face")
const fetch = require('node-fetch')
const MsRest = require("@azure/ms-rest-js")

module.exports = async function (context, req) {

    const { email, name, imageUrl } = req.body

    const extractedEmotions = await extractEmotionsFromPicture(imageUrl, context)

    let predominantEmotion = determinePredominantEmotion(extractedEmotions)

    if (!predominantEmotion) {
        predominantEmotion = 'happy'
    }

    const spotifyTokenResponseBody = await getSpotifyToken(context)

    const spotifySearchResultBody = await searchSpotifyByEmotion(predominantEmotion, spotifyTokenResponseBody, context)

    // Find a random number between 0 and 2
    const playListUrl = getRandomPlaylistUrl(spotifySearchResultBody)

    const requestId = await sendMessageToCourier(name, email, playListUrl)

    const responseMessage = `The playlist ${playListUrl} was sent to ${email} with requestID ${requestId} based on emotion ${predominantEmotion}`

    context.res = {
        body: responseMessage
    }

}

function determinePredominantEmotion(extractedEmotions) {

    if (extractedEmotions) {

        const predominantEmotion = Object.keys(extractedEmotions).reduce((a, b) => extractedEmotions[a] > extractedEmotions[b] ? a : b);
        return predominantEmotion

    }
    else {
        return null
    }

}

function getRandomPlaylistUrl(spotifySearchResultBody) {
    const randomNumber = Math.floor(Math.random() * 3)

    const playListUrl = spotifySearchResultBody.playlists.items[randomNumber].external_urls.spotify
    return playListUrl
}

async function extractEmotionsFromPicture(imageUrl, context) {

    const faceRecognitionEndPoint = process.env["FACERECOGNTION_ENDPOINT"]
    const faceRecognitionApiKey = process.env["FACERECOGNTION_API_KEY"]

    const credentials = new MsRest.ApiKeyCredentials({ inHeader: { 'Ocp-Apim-Subscription-Key': faceRecognitionApiKey } });
    const faceClient = new CognitiveServicesFace.FaceClient(credentials, faceRecognitionEndPoint);

    const detectedEmotions = await faceClient.face.detectWithUrl(imageUrl,
        {
            returnFaceAttributes: ["Emotion"],
            // We specify detection model 1 because we are retrieving attributes.
            detectionModel: "detection_01",
            recognitionModel: "recognition_03"
        })

    if (detectedEmotions.length > 0) {
        context.log("Successfully executed face detection")

        return detectedEmotions[0].faceAttributes.emotion
    }
    else {
        context.log("No emotions detected - is it a valid picture?")
        return null
    }

}

async function getSpotifyToken(context) {

    const spotifyTokenEndpoint = "https://accounts.spotify.com/api/token"

    // The Content-Type header is only set automatically to x-www-form-urlencoded when an instance of URLSearchParams is given
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');

    const authString = "Basic " + Buffer.from(`${process.env["SPOTIFY_CLIENT_ID"]}:${process.env["SPOTIFY_CLIENT_SECRET"]}`).toString('base64')

    const fetchTokenHeader = {
        'Authorization': authString
    }

    const spotifyTokenResponse = await fetch(spotifyTokenEndpoint,
        {
            method: 'POST',
            headers: fetchTokenHeader,
            body: params
        })

    let spotifyTokenResponseBody

    if (spotifyTokenResponse.status === 200) {
        spotifyTokenResponseBody = await spotifyTokenResponse.json()
    }

    else {
        context.log(`Error when fetching the Spotify token - status: ${spotifyTokenResponse.status} - ${spotifyTokenResponse.statusText}`)
    }

    return spotifyTokenResponseBody

}

async function searchSpotifyByEmotion(emotion, spotifyTokenObject, context) {

    const spotifyBaseSearchUrl = "https://api.spotify.com/v1/search"
    const spotifyQuery = emotion
    const spotifyType = "playlist"
    const spotifyLimit = "3"
    const spotifyMarket = "US"

    //Structure:     https://api.spotify.com/v1/search?q=happy&type=playlist&market=US&limit=5
    const searchUrl = `${spotifyBaseSearchUrl}?q=${spotifyQuery}&type=${spotifyType}&market=${spotifyMarket}&limit=${spotifyLimit}`

    const searchRequestHeader = {
        "Authorization": `${spotifyTokenObject.token_type} ${spotifyTokenObject.access_token}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
    }

    const spotifySearchResult = await fetch(searchUrl,
        {
            method: 'GET',
            headers: searchRequestHeader,
        })


    let spotifySearchResultBody

    if (spotifySearchResult.status === 200) {
        spotifySearchResultBody = await spotifySearchResult.json()
    }
    else {
        context.log(`Error when fetching the Spotify token - status: ${spotifySearchResult.status} - ${spotifySearchResult.statusText}`)
    }

    return spotifySearchResultBody

}

async function sendMessageToCourier(name, email, playListUrl) {

    const courierApiKey = process.env["COURIER_API_KEY"]

    const courier = CourierClient({ authorizationToken: courierApiKey })

    const emailTitle = `Welcome ${name}!`
    const emailBody = `Thanks for signing up, ${name}. We have a playlist for you ${playListUrl} - Enjoy your day!`

    const { requestId } = await courier.send({
        message: {
            to: {
                email: email,
            },
            content: {
                title: emailTitle,
                body: emailBody,
            },
            routing: {
                method: "single",
                channels: ["email"],
            },
        },
    })

    return requestId
}