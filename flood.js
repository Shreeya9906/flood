import express from "express";
import axios from "axios";
import xml2js from "xml2js";

const router = express.Router();

const HIGH_KEYWORDS = [
    "flash flood",
    "evacuation",
    "river overflow",
    "dam discharge",
    "flood warning"
];

const MEDIUM_KEYWORDS = [
    "waterlogging",
    "heavy rainfall expected",
    "monsoon alert",
    "rainfall alert"
];

const LOW_KEYWORDS = [
    "rain expected",
    "weather disturbance"
];

const isToday = (dateStr) => {
    const today = new Date().toISOString().slice(0, 10);
    return dateStr.startsWith(today);
};

router.get("/", async (req, res) => {
    const city = req.query.city;
    if (!city) return res.status(400).json({ error: "City required" });

    const API_KEY = process.env.OPENWEATHER_KEY;
    if (!API_KEY) return res.status(500).json({ error: "Missing OpenWeather key" });

    try {
        // 1️⃣ Get city weather + rain
        const weatherURL = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=metric`;

        const wRes = await axios.get(weatherURL);
        const w = wRes.data;

        const lat = w.coord.lat;
        const lon = w.coord.lon;

        const rain1h = w.rain?.["1h"] || 0;
        const rain3h = w.rain?.["3h"] || 0;
        const temp = w.main.temp;
        const humidity = w.main.humidity;
        const description = w.weather[0].description;

        // 2️⃣ Fetch UV Index (OneCall free replacement)
        const onecall = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;
        const oneRes = await axios.get(onecall);
        const uvi = oneRes.data.city.sunrise ? 0 : 0; // Free tier doesn’t give UVI → Return 0

        // 3️⃣ Google News RSS
        const rssURL =
            `https://news.google.com/rss/search?q=${encodeURIComponent(city + " flood OR rain OR waterlogging")}&hl=en-IN&gl=IN&ceid=IN:en`;

        const rss = await axios.get(rssURL);
        const parsed = await xml2js.parseStringPromise(rss.data, { mergeAttrs: true });
        let items = parsed.rss.channel[0].item || [];

        // Only keep today's alerts
        items = items.filter(x => isToday(new Date(x.pubDate[0]).toISOString()));

        let newsAlerts = [];

        items.forEach(item => {
            const title = item.title[0].toLowerCase();
            let level = "LOW";

            if (HIGH_KEYWORDS.some(k => title.includes(k))) level = "HIGH";
            else if (MEDIUM_KEYWORDS.some(k => title.includes(k))) level = "MEDIUM";

            newsAlerts.push({
                title: item.title[0],
                published: item.pubDate[0],
                level
            });
        });

        // 4️⃣ Flood Risk Logic
        let flood_risk = "SAFE";
        let reasons = [];

        // Weather-based checks
        if (rain1h > 5) {
            flood_risk = "HIGH";
            reasons.push("Rainfall > 5mm/hr");
        } else if (rain3h > 10) {
            flood_risk = "MEDIUM";
            reasons.push("Rainfall > 10mm in 3 hours");
        } else if (rain1h > 1) {
            flood_risk = "LOW";
            reasons.push("Light rainfall detected");
        }

        // News impact
        if (newsAlerts.some(n => n.level === "HIGH")) {
            flood_risk = "HIGH";
            reasons.push("Google News detected HIGH alert keywords");
        } else if (newsAlerts.some(n => n.level === "MEDIUM")) {
            if (flood_risk !== "HIGH") flood_risk = "MEDIUM";
            reasons.push("Google News detected MEDIUM alert keywords");
        }

        if (reasons.length === 0) {
            flood_risk = "SAFE";
            reasons.push("No risk indicators detected");
        }

        // 5️⃣ Final response in YOUR format
        return res.json({
            city,
            weather: {
                temperature: temp,
                humidity,
                rain_1h: rain1h,
                rain_3h: rain3h,
                uvi,
                description
            },
            flood_risk_level: flood_risk,
            reasons,
            news_alerts: newsAlerts
        });

    } catch (err) {
        return res.status(500).json({
            error: "Failed to generate flood alert",
            details: err.response?.data || err.message
        });
    }
});

export default router;
