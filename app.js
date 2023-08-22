const express = require('express');
const Parser = require('rss-parser');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const app = express();
const parser = new Parser();
const schedule = require('node-schedule');
require('dotenv').config();

// Set up Mongoose connection
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
    console.log('Connected to MongoDB:', db.name);
});

app.use(express.json());

// Define the schema with explicit collection name
const jobFeedSchema = new mongoose.Schema({
    title: String,
    url: String,
}, { collection: 'job_feed' });

// Create the model using the schema
const JobFeed = mongoose.model('JobFeed', jobFeedSchema);

app.get('/check-new-jobs-email', async (req, res) => {
    try {
        // Call the fetchAndSendJobAlerts function
        await fetchAndSendJobAlertsEmail();

        res.json({ message: 'Job checking completed' });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'An error occurred' });
    }
});

// Function to fetch and send job alerts
async function fetchAndSendJobAlertsEmail() {
    try {
        const feed = await parser.parseURL(process.env.RSS_FEED_URL);
        const newJobs = []; // Store new job listings

        // Retrieve existing job listings from the database
        const existingJobListings = await JobFeed.find({}, 'title');
        const existingTitles = existingJobListings.map(listing => listing.title);

        // Collect new job titles and URLs (limit to 20)
        const maxJobs = 20;
        for (let i = 0; i < Math.min(maxJobs, feed.items.length); i++) {
            const item = feed.items[i];
            const title = item.title;
            const url = item.link;

            if (!existingTitles.includes(title)) {
                newJobs.push({ title, url });
            }
        }

        // Save new job listings to MongoDB
        if (newJobs.length > 0) {
            const insertedJobListings = await JobFeed.insertMany(newJobs);
            console.log('Successfully saved', insertedJobListings.length, 'new job listings to MongoDB');

            // Rest of the code for sending email using Nodemailer...
        } else {
            console.log('No new job listings to save.');
        }
        if (newJobs.length > 0) {
            // Set up Nodemailer transporter
            const transporter = nodemailer.createTransport({
                service: 'Gmail',
                auth: {
                    user: process.env.EMAIL_USERNAME, // Your Gmail username
                    pass: process.env.APP_SPEC_PASSWORD // Your Gmail password
                }
            });

            const messageBody = newJobs
                .map(job => `${job.title}\n${job.url}`)
                .join('\n\n'); // Combine job titles and URLs

            // Set up email data
            const mailOptions = {
                from: process.env.EMAIL_USERNAME, // Sender's email address
                to: process.env.RECIPIENT_EMAIL, // Recipient's email address
                subject: 'New Job Listings', // Email subject
                text: messageBody // Email body
            };

            // Send the email
            const info = await transporter.sendMail(mailOptions);
            console.log('Email sent:', info.response);
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
    
}

const cronExpression = '*/15 7-19 * * *'; // Every 15 minutes from 7 AM to 7 PM
schedule.scheduleJob(cronExpression, fetchAndSendJobAlertsEmail);


app.listen(8000, () => {
    console.log('Server is running on port 8000');
});
