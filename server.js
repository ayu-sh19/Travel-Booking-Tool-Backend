// server/server.js
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const dotenv = require("dotenv");
const { Client, Databases } = require("node-appwrite");

dotenv.config();

const app = express();
app.use(cors()); // Allow all origins or configure as needed
app.use(express.json());

// Endpoint to fetch hotel offers from Amadeus API

const client = new Client()
  .setEndpoint(process.env.APPWRITE_URL)
  .setProject(process.env.APPWRITE_PROJECT_ID);

const databases = new Databases(client);

async function getToken() {
  try {
    const collectionId = String(process.env.APPWRITE_COLLECTION_ID);
    const databaseId = String(process.env.APPWRITE_DATABASE_ID);
    const documentId = String(process.env.APPWRITE_DOCUMENT_ID);

    const document = await databases.getDocument(
      databaseId,
      collectionId,
      documentId
    );

    let token = document.token;
    const expiresAt = new Date(document.expires_at);
    const now = new Date();

    if (now >= expiresAt) {
      console.log("Token is expired. Refreshing it now");
      token = await fetchAmadeusToken();

      const newExpiresAt = new Date(
        now.getTime() + 30 * 60 * 1000
      ).toISOString();

      await databases.updateDocument(databaseId, collectionId, documentId, {
        token: token,
        expires_at: newExpiresAt,
      });

      console.log(token);
    }
    return token;
  } catch (error) {
    console.error("Error Retrieveing Error", error);
  }
}

async function fetchAmadeusToken() {
  try {
    const tokenResponse = await axios.post(
      "https://test.api.amadeus.com/v1/security/oauth2/token",
      new URLSearchParams({
        grant_type: "client_credentials",
        client_id: process.env.AMADEUS_CLIENT_ID,
        client_secret: process.env.AMADEUS_CLIENT_SECRET,
      }).toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );
    const token = tokenResponse.data.access_token;
    return token;
  } catch (error) {
    console.error(
      "Error while fetching Auth Token",
      error.response?.data || error.message
    );
    res
      .status(500)
      .json({ error: "An error occurred while fetching hotel offers." });
  }
}

/* app.get("/api/login", async (req, res) => {
  try {
    const tokenResponse = await axios.post(
      "https://test.api.amadeus.com/v1/security/oauth2/token",
      new URLSearchParams({
        grant_type: "client_credentials",
        client_id: process.env.AMADEUS_CLIENT_ID,
        client_secret: process.env.AMADEUS_CLIENT_SECRET,
      }).toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );
    const token = tokenResponse.data.access_token;
    console.log(token);
    res.json(token);
  } catch (error) {
    console.error(
      "Error in proxy endpoint:",
      error.response?.data || error.message
    );
    res
      .status(500)
      .json({ error: "An error occurred while fetching hotel offers." });
  }
}); */

app.get("/api/hotel-offers", async (req, res) => {
  const { cityCode, checkInDate, checkOutDate, adults } = req.query;

  try {
    const authToken = await getToken();
    const hotelResponse = await axios.get(
      `https://test.api.amadeus.com/v1/reference-data/locations/hotels/by-city?${cityCode}`,
      {
        params: { cityCode },
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );

    const hotels = hotelResponse.data.data.slice(1, 10).map((hotel) => {
      return hotel.hotelId;
    });
    const hotelIds = hotels.map(String).join(",");
    // console.log((JSON.parse(hotelResponse.data)).slice(1,10))
    // console.log(typeof(hotelResponse.data));

    const hotelOfferResponse = await axios.get(
      `https://test.api.amadeus.com/v3/shopping/hotel-offers`,
      {
        params: { hotelIds, checkInDate, checkOutDate },
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );

    res.json(hotelOfferResponse.data);
  } catch (error) {
    console.error(
      "Error in proxy endpoint:",
      error.response?.data || error.message
    );
    res
      .status(500)
      .json({ error: "An error occurred while fetching hotel offers." });
  }
});

app.get("/api/book-hotel", async (req, res) => {
  const { id } = req.query;
  console.log(id);
  try {
    const authToken = await getToken();
    const hotelResponse = await axios.get(
      `https://test.api.amadeus.com/v3/shopping/hotel-offers/${id}`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );
    res.json(hotelResponse.data);
  } catch (error) {
    console.error(
      "Error in proxy endpoint:",
      error.response?.data || error.message
    );
    res
      .status(500)
      .json({ error: "An error occurred while fetching hotel offers." });
  }
});

app.post("/api/booking", async (req, res) => {
  const payload = req.body;
  try {
    const authToken = await getToken();
    const bookingResponse = await axios.post(
      "https://test.api.amadeus.com/v2/booking/hotel-orders",
      payload,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }
    );

    // console.log(res.json(bookingResponse.data));
    res.json(bookingResponse.data);
  } catch (error) {
    console.error(
      "Error in proxy endpoint:",
      error.response?.data || error.message
    );
    res
      .status(500)
      .json({ error: "An error occurred while fetching hotel offers." });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Proxy server is running on port ${PORT}`));
