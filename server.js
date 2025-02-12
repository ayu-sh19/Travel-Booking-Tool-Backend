// server/server.js
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const dotenv = require("dotenv");
const { Client, Account, Databases } = require("appwrite");

dotenv.config();

const app = express();
// app.use(cors()); // Allow all origins or configure as needed
app.use(express.json());

app.use((req, res, next) => {
  const origin = req.headers.origin;

  // For example, only allow requests from your Vercel domain:
  if (
    origin &&
    origin === "https://travel-booking-tool-frontend-x.vercel.app"
  ) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    // If credentials (cookies, etc.) are used:
    // res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  // Set allowed methods and headers for all requests
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  next();
});

// Special handling for preflight OPTIONS requests on your API route
app.options("/api/hotel-offers", (req, res) => {
  // Set the CORS headers as above
  const origin = req.headers.origin;
  if (
    origin &&
    origin === "https://travel-booking-tool-frontend-x.vercel.app"
  ) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    // res.setHeader('Access-Control-Allow-Credentials', 'true'); // if needed
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // **Important:** Allow private network access for requests coming from public origins
  res.setHeader("Access-Control-Allow-Private-Network", "true");

  // Respond with 200 OK for the preflight request
  res.sendStatus(200);
});

// Endpoint to fetch hotel offers from Amadeus API

const client = new Client()
  .setEndpoint(process.env.APPWRITE_URL)
  .setProject(process.env.APPWRITE_PROJECT_ID);

const databases = new Databases(client);
const account = new Account(client);

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

app.post("/api/login", async (req, res) => {
  const payload = req.body;
  try {
    const email = payload.email;
    const password = payload.password;
    const response = await account.createEmailPasswordSession(email, password);
    res.json(response.data);
  } catch (error) {
    throw error;
  }
});

app.post("/api/logout", async (req, res) => {
  const payload = req.body;
  console.log(payload);
  if (req.headers.cookie) {
    client.headers["cookie"] = req.headers.cookie;
  }
  try {
    // const email = payload.email;
    // const password = payload.password;
    // const session = await account.createEmailPasswordSession(email, password);
    // console.log("Session Created", session.$id);
    // const user = await account.get();
    // console.log("Get User", user);
    // const response = await account.deleteSession(session.$id.toString());
    const response = await account.deleteSessions();
    res.json(response.data);
  } catch (error) {
    throw error;
  }
});

app.get("/api/getUser", async (req, res) => {
  try {
    const response = await account.get();
    res.json(response.data);
  } catch (error) {
    throw error;
  }
});

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
