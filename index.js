const express = require("express");
const dotenv = require("dotenv");
const path = require("path");
const stripe = require("stripe"); // Stripe requires initialization after loading the environment
const cors = require('cors');

// Load environment variables
dotenv.config(); // Ensure dotenv loads before accessing environment variables

// Verify that STRIPE_SECRET_KEY is loaded
if (!process.env.STRIPE_SECRET_KEY) {
  console.error("Error: STRIPE_SECRET_KEY is not defined in the .env file.");
  process.exit(1); // Exit the application if the key is missing
}

// Initialize Stripe
const stripeInstance = stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 8080;

// Middleware
app.use(cors({ origin: "https://airosofts.com" })); // Restrict to your domain
app.use(express.static(path.join(__dirname))); // Serve static files

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/subscribe", async (req, res) => {
  const plan = req.query.plan;
    console.log(plan)
  if (!plan) {
    return res.send("Subscription plan not found!");
  }

  let priceid;
  switch (plan.toLowerCase()) {
    case "starter":
      priceid = "price_1QYSdNG8ztKaoxw1mvzwyhyA"; // Replace with your actual price ID
      break;
    case "pro":
      priceid = "price_1QYSduG8ztKaoxw1cAKV1e2Y"; // Replace with your actual price ID
      break;
    default:
      return res.send("Subscription plan not found!");
  }

  try {
    const session = await stripeInstance.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: priceid,
          quantity: 1,
        },
      ],
      success_url: `${process.env.BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BASE_URL}/cancel`,
    });

    res.redirect(session.url); // Redirect user to the Stripe checkout page
  } catch (error) {
    console.error("Error creating checkout session:", error);
    res.status(500).send("Internal Server Error");
  }
});
//Success 
app.get('/success', async (req, res) => {
    try {
      const session = await stripeInstance.checkout.sessions.retrieve(req.query.session_id, {expand: ['subscription', 'subscription.plan.product']});
      console.log(session);
      res.send('Subscribed Successfully');
    } catch (error) {
      console.error("Error retrieving session:", error);
      res.status(400).send("Invalid session ID");
    }
  });
  
// Cancel
app.get('/cancel', async (req,res) => {
    res.redirect('/');
    })

    app.get('/customers', async (req, res) => {
        const customerid = req.query.customerid;
      
        if (!customerid) {
          return res.status(400).send("Customer ID is required!");
        }
      
        try {
          const portalSession = await stripeInstance.billingPortal.sessions.create({
            customer: customerid,
            return_url: `${process.env.BASE_URL}/`, // URL to redirect the customer back to after managing their subscription
          });
      
          // Redirect the user to the Stripe Customer Portal
          res.redirect(portalSession.url);
        } catch (error) {
          console.error("Error creating customer portal session:", error);
          res.status(500).send("Failed to create customer portal session.");
        }
      });
      
// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
