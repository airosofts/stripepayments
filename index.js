const express = require("express");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
const stripe = require("stripe"); // Stripe requires initialization after loading the environment
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

// Initialize Supabase client

// Load environment variables
dotenv.config(); // Ensure dotenv loads before accessing environment variables
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Verify that STRIPE_SECRET_KEY is loaded
if (!process.env.STRIPE_SECRET_KEY) {
  console.error("Error: STRIPE_SECRET_KEY is not defined in the .env file.");
  process.exit(1); // Exit the application if the key is missing
}

// Initialize Stripe
const stripeInstance = stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
// Middleware
// app.use(cors({ origin: "https://airosofts.com" })); // Restrict to your domain
app.use(express.static(path.join(__dirname))); // Serve static files
app.use(cors()); // Allow cross-origin requests
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
async function sendProfessionalEmail(email, password) {
  try {
    const transporter = nodemailer.createTransport({
      service: "Gmail", // Replace with your email service provider if needed
      auth: {
        user: process.env.EMAIL_USER, // Your email address
        pass: process.env.EMAIL_PASSWORD, // Your email password
      },
    });

    // Bootstrap-inspired professional email template
    const emailTemplate = `
      <div style="font-family: 'Roboto', Arial, sans-serif; max-width: 700px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 10px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); overflow: hidden;">
        <!-- Header -->
        <div style="background-color: #D74B3F; padding: 20px; text-align: center; color: white; font-size: 24px; font-weight: bold; border-bottom: 2px solid #e5e7eb;">
          Welcome to AiroSofts
        </div>

        <!-- Body -->
        <div style="padding: 30px; background-color: #ffffff; line-height: 1.8; color: #333;">
          <p style="font-size: 16px; margin-bottom: 20px;">Dear Valued Customer,</p>
          <p style="font-size: 16px; margin-bottom: 20px;">Thank you for choosing <strong>AiroSofts</strong> as your automation partner. We're excited to have you on board and are dedicated to supporting your automation journey.</p>

          <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; background-color: #f9f9f9; margin-bottom: 30px;">
            <h2 style="font-size: 18px; color: #D74B3F; margin-bottom: 15px;">Your Login Credentials</h2>
            <p style="margin: 0; font-size: 16px;"><strong>Email:</strong> ${email}</p>
            <p style="margin: 0; font-size: 16px;"><strong>Password:</strong> ${password}</p>
          </div>

          <p style="font-size: 16px; margin-bottom: 20px;">You can log in to your dashboard to access your purchased products:</p>
          <div style="text-align: center; margin-top: 20px;">
            <a href="https://dashboard.airosofts.com" style="background-color: #D74B3F; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);">Login to Dashboard</a>
          </div>
        </div>

        <!-- Footer -->
        <div style="background-color: #f3f4f6; padding: 20px; text-align: center; font-size: 14px; color: #6b7280; border-top: 1px solid #e5e7eb;">
          <p style="margin: 0;">If you did not request this email, please ignore it or contact our support team.</p>
          <p style="margin: 0; margin-top: 10px;">&copy; 2024 AiroSofts. All rights reserved.</p>
        </div>
      </div>
    `;

    const mailOptions = {
      from: `"AiroSofts Support" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Welcome to AiroSofts - Your Login Credentials",
      html: emailTemplate,
    };

    await transporter.sendMail(mailOptions);
    //console.log("Email sent successfully to:", email);
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
}

const plans = {
  prod1_basic: "price_1QbWMxG8ztKaoxw1xzE9ziiE",
  prod1_pro: "price_1QbWNMG8ztKaoxw1vQpSMZqY",
  prod1_professional: "price_1QbWNmG8ztKaoxw1Z19xCzdH",
  prod2_basic: "price_1QboJ3G8ztKaoxw1mNpNfjCe",
  prod2_pro: "price_1QboJ3G8ztKaoxw1bbYC0GuI",
  prod2_professional: "price_1QboJ3G8ztKaoxw15oEULSBc",
};


app.get("/subscribe", async (req, res) => {
  const planId = req.query.planId;

  //console.log(`Plan ID: ${planId}`);

  if (!plans[planId]) {
    return res.status(400).send("Invalid plan!");
  }

  try {
    const session = await stripeInstance.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: plans[planId], quantity: 1 }],
      success_url: `${process.env.BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BASE_URL}/cancel`,
    });
   // console.log("Stripe Session:", session);
    res.redirect(session.url);
  } catch (error) {
    console.error("Stripe Error:", error.message);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/success", async (req, res) => {
  try {
    const session = await stripeInstance.checkout.sessions.retrieve(
      req.query.session_id,
      {
        expand: [
          "subscription",
          "subscription.plan.product",
          "line_items.data.price.product",
        ],
      }
    );

    const customer = session.customer_details || {};
    const subscription = session.subscription || {};
    const product = session.line_items?.data[0]?.price?.product || {};
    const productPrice = session.line_items?.data[0]?.price?.unit_amount || 0;

    if (
      !session.customer ||
      !subscription.id ||
      !product.id ||
      !customer.email
    ) {
      console.error("Missing required data from Stripe session.");
      return res
        .status(400)
        .send("Error: Missing required data from Stripe session.");
    }

    let customerId;
    const { data: existingCustomer, error: fetchCustomerError } = await supabase
      .from("customers")
      .select("id")
      .eq("email", customer.email);

    if (fetchCustomerError) {
      console.error(
        "Error fetching customer from Supabase:",
        fetchCustomerError
      );
      return res.status(500).send("Error verifying customer data.");
    }

    if (existingCustomer && existingCustomer.length > 0) {
      customerId = existingCustomer[0].id;

      const { error: subscriptionError } = await supabase
        .from("subscriptions")
        .upsert(
          {
            id: subscription.id,
            customer_id: customerId,
            product_id: product.id,
            product_name: product.name || "Unknown Product",
            product_price: productPrice / 100,
            status: subscription.status || "unknown",
            start_date: subscription.start_date
              ? new Date(subscription.start_date * 1000)
              : null,
            current_period_end: subscription.current_period_end
              ? new Date(subscription.current_period_end * 1000)
              : null,
          },
          { onConflict: "id" }
        );

      if (subscriptionError) {
        console.error(
          "Error updating subscription to Supabase:",
          subscriptionError
        );
        return res.status(500).send("Error updating subscription data.");
      }

      const newLicenseKey = generateLicenseKey();
      const registrationDate = new Date();
      const expiryDate = new Date(registrationDate);
      expiryDate.setMonth(registrationDate.getMonth() + 1);

      const { error: usersTableError } = await supabase
        .from("users")
        .upsert(
          {
            username: customer.name || "Unknown User",
            email: customer.email,
            country: customer.address?.country || "Unknown",
            license_key: newLicenseKey,
            registration_date: registrationDate,
            expiry_date: expiryDate,
            product_id: product.id,
            payment_plan: subscription.plan?.nickname || "Unknown Plan",
            subid: subscription.id, // Ensure subid is updated
            cusid: session.customer, // Ensure cusid is updated
            softwarelimit:
              subscription.plan?.nickname === "Basic"
                ? 10000
                : subscription.plan?.nickname === "Pro"
                ? 50000
                : subscription.plan?.nickname === "Professional"
                ? 250000
                : 0,
            softwarelimitremains:
              subscription.plan?.nickname === "Basic"
                ? 10000
                : subscription.plan?.nickname === "Pro"
                ? 50000
                : subscription.plan?.nickname === "Professional"
                ? 250000
                : 0,
          },
          { onConflict: "id" }
        );

      if (usersTableError) {
        console.error("Error updating user in users table:", usersTableError);
        return res.status(500).send("Error updating user data.");
      }

      await sendExistingUserEmail(customer.email);
    } else {
      const { data: newCustomer, error: customerError } = await supabase
        .from("customers")
        .insert({
          id: session.customer,
          name: customer.name || "Unknown",
          email: customer.email,
          phone: customer.phone || null,
        })
        .select("id");

      if (customerError) {
        console.error("Error saving customer to Supabase:", customerError);
        return res.status(500).send("Error saving customer data.");
      }

      customerId = newCustomer[0].id;

      const randomPassword = generatePassword();

      const { error: websiteUserError } = await supabase
        .from("websiteusers")
        .upsert(
          {
            email: customer.email,
            password: randomPassword,
            registration_date: new Date(),
            stripe_customer_id: session.customer,
          },
          { onConflict: "email" }
        );

      if (websiteUserError) {
        console.error("Error saving user to websiteusers:", websiteUserError);
        return res.status(500).send("Error saving website user data.");
      }

      const licenseKey = generateLicenseKey();
      const registrationDate = new Date();
      const expiryDate = new Date(registrationDate);
      expiryDate.setMonth(registrationDate.getMonth() + 1);

      const softwareLimit =
        subscription.plan?.nickname === "Basic"
          ? 10000
          : subscription.plan?.nickname === "Pro"
          ? 50000
          : subscription.plan?.nickname === "Professional"
          ? 250000
          : 0;

      const { error: usersTableError } = await supabase.from("users").insert({
        username: customer.name || "Unknown User",
        email: customer.email,
        country: customer.address?.country || "Unknown",
        license_key: licenseKey,
        registration_date: registrationDate,
        expiry_date: expiryDate,
        product_id: product.id,
        payment_plan: subscription.plan?.nickname || "Unknown Plan",
        subid: subscription.id, // Ensure subid is set
        cusid: session.customer, // Ensure cusid is set
        softwarelimit: softwareLimit,
        softwarelimitremains: softwareLimit,
      });

      if (usersTableError) {
        console.error("Error saving user to users table:", usersTableError);
        return res.status(500).send("Error saving user license data.");
      }

      const { error: subscriptionError } = await supabase
        .from("subscriptions")
        .insert({
          id: subscription.id,
          customer_id: customerId,
          product_id: product.id,
          product_name: product.name || "Unknown Product",
          product_price: productPrice / 100,
          status: subscription.status || "unknown",
          start_date: subscription.start_date
            ? new Date(subscription.start_date * 1000)
            : null,
          current_period_end: subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000)
            : null,
        });

      if (subscriptionError) {
        console.error("Error saving subscription to Supabase:", subscriptionError);
        return res.status(500).send("Error saving subscription data.");
      }

      await sendProfessionalEmail(customer.email, randomPassword);
    }

    console.log("Customer, subscription, and user data saved successfully.");
    res.redirect("https://www.airosofts.com/thank-you");
  } catch (error) {
    console.error("Error retrieving session or saving data:", error);
    res.status(500).send("An unexpected error occurred.");
  }
});

const generateLicenseKey = () => {
  const charset =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 20 })
    .map(() => charset.charAt(Math.floor(Math.random() * charset.length)))
    .join("");
};

const generatePassword = () => {
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()";
  return Array.from({ length: 12 })
    .map(() => charset.charAt(Math.floor(Math.random() * charset.length)))
    .join("");
};



// Function to send an email for existing users
async function sendExistingUserEmail(email) {
  try {
    const transporter = nodemailer.createTransport({
      service: "Gmail", // Replace with your email service provider if needed
      auth: {
        user: process.env.EMAIL_USER, // Your email address
        pass: process.env.EMAIL_PASSWORD, // Your email password
      },
    });

    // Email template for existing users
    const emailTemplate = `
      <div style="font-family: 'Roboto', Arial, sans-serif; max-width: 700px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 10px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); overflow: hidden;">
        <!-- Header -->
        <div style="background-color: #D74B3F; padding: 20px; text-align: center; color: white; font-size: 24px; font-weight: bold; border-bottom: 2px solid #e5e7eb;">
          Thank You for Your Purchase!
        </div>

        <!-- Body -->
        <div style="padding: 30px; background-color: #ffffff; line-height: 1.8; color: #333;">
          <p style="font-size: 16px; margin-bottom: 20px;">Dear Valued Customer,</p>
          <p style="font-size: 16px; margin-bottom: 20px;">Thank you for choosing <strong>AiroSofts</strong> again. We're excited to continue supporting your automation journey.</p>

          <p style="font-size: 16px; margin-bottom: 20px;">As you are already an existing user, you can log in to your dashboard to access your purchased products and manage your subscription:</p>

          <div style="text-align: center; margin-top: 20px;">
            <a href="https://dashboard.airosofts.com" style="background-color: #D74B3F; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);">Login to Dashboard</a>
          </div>
        </div>

        <!-- Footer -->
        <div style="background-color: #f3f4f6; padding: 20px; text-align: center; font-size: 14px; color: #6b7280; border-top: 1px solid #e5e7eb;">
          <p style="margin: 0;">If you have any questions, please contact our support team.</p>
          <p style="margin: 0; margin-top: 10px;">&copy; 2024 AiroSofts. All rights reserved.</p>
        </div>
      </div>
    `;

    const mailOptions = {
      from: `"AiroSofts Support" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Thank You for Your Purchase - AiroSofts",
      html: emailTemplate,
    };

    await transporter.sendMail(mailOptions);
  ///  console.log("Existing user email sent successfully to:", email);
  } catch (error) {
    console.error("Error sending email to existing user:", error);
    throw error;
  }
}
app.get("/api/user-subscriptions", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Unauthorized. Token is missing." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { email } = decoded;

    if (!email) {
      return res.status(400).json({ error: "User email is required!" });
    }

    // Fetch all user data matching the email
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("subid, softwarelimit, softwarelimitremains, product_id")
      .eq("email", email);

    if (userError || !userData || userData.length === 0) {
      console.error("Error fetching user data:", userError);
      return res.status(404).json({ error: "User not found." });
    }

    // Collect all subids for the user
    const subIds = userData.map(user => user.subid);

    // Fetch subscriptions matching the subids
    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from("subscriptions")
      .select("id, product_id, product_name, start_date, current_period_end, status")
      .in("id", subIds);

    if (subscriptionsError || !subscriptions || subscriptions.length === 0) {
      console.error("Error fetching subscriptions:", subscriptionsError);
      return res.status(404).json({ error: "Subscriptions not found." });
    }

    const products = [];

    for (const subscription of subscriptions) {
      // Fetch the software icon for the product
      const { data: productData, error: productError } = await supabase
        .from("Softwares Drive")
        .select('"software name", "software icon"')
        .eq("product_id", subscription.product_id);

      if (productError || !productData?.length) {
        console.warn(`No product details found for product_id: ${subscription.product_id}`);
        continue; // Skip this product and continue the loop
      }

      const user = userData.find(user => user.subid === subscription.id);

      products.push({
        name: subscription.product_name,
        logo: productData[0]["software icon"],
        plan: "Recurring Plan", // Assuming all are recurring
        start_date: subscription.start_date,
        next_billing_date: subscription.current_period_end,
        status: subscription.status,
        auto_renewal: true, // Assuming auto-renewal is enabled
        limit: user ? user.softwarelimit : 0,
        limit_used: user ? user.softwarelimit - user.softwarelimitremains : 0,
      });
    }

    res.json(products);
  } catch (error) {
    console.error("Error retrieving subscriptions:", error);
    res.status(500).json({ error: "An unexpected error occurred." });
  }
});


// Cancel
app.get("/cancel", async (req, res) => {
  res.redirect("https://www.airosofts.com/");
});
app.get("/customers", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Unauthorized. Token is missing." });
    }

    // Verify the JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { email } = decoded;

    if (!email) {
      return res.status(400).json({ error: "Email is required in the token." });
    }

    // Fetch customer ID from the database
    const { data: customerData, error: customerError } = await supabase
      .from("customers")
      .select("id")
      .eq("email", email)
      .single();

    if (customerError || !customerData) {
      return res.status(404).json({ error: "Customer not found." });
    }

    const customerId = customerData.id;

    // Create a Stripe billing portal session
    const portalSession = await stripeInstance.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.BASE_URL}/`, // Redirect after managing subscription
    });

    // Send the Stripe portal URL back to the client
    res.json({ url: portalSession.url });
  } catch (error) {
    console.error(
      "Error creating customer portal session:",
      error.message || error
    );
    res
      .status(500)
      .json({ error: "Failed to create customer portal session." });
  }
});

// Login API

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const { data, error } = await supabase
      .from("websiteusers")
      .select("*")
      .eq("email", email)
      .single();

    if (error || !data || data.password !== password) {
      return res
        .status(401)
        .send({ success: false, message: "Invalid email or password." });
    }

    // Generate a JWT with email and stripe_customer_id
    const token = jwt.sign(
      { email: data.email, stripe_customer_id: data.stripe_customer_id },
      process.env.JWT_SECRET,
      { expiresIn: "1h" } // Token expiration
    );

    res.send({
      success: true,
      token,
      redirectUrl: "http://localhost:4000/dashboard.html",
    });
  } catch (error) {
    console.error("Error validating user:", error);
    res.status(500).send({ success: false, message: "Internal server error." });
  }
});
app.post("/api/change-password", async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Unauthorized. Token is missing." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { email } = decoded;

    // Fetch user details from Supabase
    const { data: user, error } = await supabase
      .from("websiteusers")
      .select("password") // Only select the password field
      .eq("email", email)
      .single();

    if (error || !user) {
      console.error("Supabase error:", error);
      return res.status(400).json({ error: "User not found." });
    }

    // Compare current password directly
    if (currentPassword !== user.password) {
      return res.status(400).json({ error: "Current password is incorrect." });
    }

    // Update the new password directly (plaintext)
    const { error: updateError } = await supabase
      .from("websiteusers")
      .update({ password: newPassword }) // Save new password as plaintext
      .eq("email", email);

    if (updateError) {
      console.error("Update error:", updateError);
      return res.status(500).json({ error: "Failed to update password." });
    }

    res.json({ message: "Password changed successfully." });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

app.get("/api/user-details", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Unauthorized. Token is missing." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { email } = decoded;

    // Fetch user details from the customers table
    const { data: customer, error } = await supabase
      .from("customers")
      .select("name, email, phone, address")
      .eq("email", email)
      .single();

    if (error || !customer) {
      console.error("Supabase error:", error);
      return res.status(400).json({ error: "User not found." });
    }
   // console.log(customer);

    // Send customer data as JSON response
    res.json(customer);
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

app.get("/api/available-softwares", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Unauthorized. Token is missing." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { email } = decoded;

    // Fetch the customer ID using the email
    const { data: user, error: userError } = await supabase
      .from("websiteusers")
      .select("stripe_customer_id")
      .eq("email", email)
      .single();

    if (userError || !user) {
      console.error("User fetch error:", userError);
      return res.status(400).json({ error: "User not found." });
    }

    const customerId = user.stripe_customer_id;

    // Fetch active subscriptions for the customer
    const { data: subscriptions, error: subscriptionError } = await supabase
      .from("subscriptions")
      .select("product_id")
      .eq("customer_id", customerId)
      .eq("status", "active");

    if (subscriptionError || !subscriptions.length) {
      console.error("Subscription fetch error:", subscriptionError);
      return res.status(404).json({ error: "No active subscriptions found." });
    }

    const productIds = [...new Set(subscriptions.map((sub) => sub.product_id))];

    // Fetch software details matching the product IDs
    const { data: softwares, error: softwareError } = await supabase
      .from("Softwares Drive")
      .select(
        '"software name", "software description", "software icon", "software drive link", product_id'
      )
      .in("product_id", productIds);

    if (softwareError || !softwares.length) {
      console.error("Software fetch error:", softwareError);
      return res
        .status(404)
        .json({ error: "No software found for active subscriptions." });
    }

    // Fetch all licenses for the user's email
    const { data: licenseInfo, error: licenseError } = await supabase
      .from("users")
      .select("email, license_key, registration_date, expiry_date, status, product_id")
      .eq("email", email);

    if (licenseError || !licenseInfo.length) {
      console.error("License fetch error:", licenseError);
      return res.status(404).json({ error: "License information not found." });
    }

    // Combine software and corresponding license information
    const response = productIds.map((productId) => {
      const software = softwares.find((sw) => sw.product_id === productId);
      const licenses = licenseInfo.filter((lic) => lic.product_id === productId);

      return {
        software,
        licenses,
        email, // Include email explicitly
      };
    });
//console.log(response);
    res.json(response);
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
