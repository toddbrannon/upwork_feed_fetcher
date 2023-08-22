const express = require('express');
const Parser = require('rss-parser');
const app = express();
const nodemailer = require('nodemailer');
const parser = new Parser();
const twilio = require('twilio');
const mongoose = require('mongoose');
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

const PORT = 8000;
// ... other setup ...

app.use(express.json());

// Set up Twilio client
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioClient = new twilio(accountSid, authToken);

app.get('/check-new-jobs', async (req, res) => {
    try {
        // Call the fetchAndSendJobAlerts function
        await fetchAndSendJobAlerts();

        res.json({ message: 'Job checking completed' });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'An error occurred' });
    }
});

// Function to fetch and send job alerts
async function fetchAndSendJobAlerts() {
    try {
        const feed = await parser.parseURL(process.env.RSS_FEED_URL);
        const newJobs = []; // Store new job listings

        // Compare feed items with existing job listings and find new ones
        // You can store existing job data in a database and compare here

        // Collect new job titles and URLs (limit to 20)
        const maxJobs = 1; // Set the maximum number of jobs to collect
        for (let i = 0; i < Math.min(maxJobs, feed.items.length); i++) {
            const item = feed.items[i];
            const title = item.title;
            const url = item.link;
            newJobs.push({ title, url });
        }

        if (newJobs.length > 0) {
            const messageBody = newJobs
                .map(job => `${job.title}\n${job.url}`)
                .join('\n\n'); // Combine job titles and URLs

            const message = await twilioClient.messages.create({
                body: messageBody,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: process.env.USER_PHONE_NUMBER
            });

            console.log('SMS sent:', message.sid);
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

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
            // Define the schema with explicit collection name
            const jobFeedSchema = new mongoose.Schema({
                title: String,
                url: String,
            }, { collection: 'job_feed' });
        
            // Create the model using the schema
            const JobFeed = mongoose.model('JobFeed', jobFeedSchema);
        
            console.log('Inserting job listings into collection:', JobFeed.collection.name); // Log the collection name
        
            // Insert job listings into MongoDB
            if (newJobs.length > 0) {
                const insertedJobListings = await JobFeed.insertMany(newJobs);
        
                if (insertedJobListings.length === newJobs.length) {
                        console.log('Successfully saved', insertedJobListings.length, 'job listings to MongoDB');
                    } else {
                        console.log('Some job listings were not inserted properly.');
                    }
                } else {
                console.log('No new job listings to save.');
                }
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


app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
