import { Router } from "express";
import { sendEmail } from "./email-service";

const testEmailRouter = Router();

// Simple test email endpoint
testEmailRouter.post("/test-email", async (req, res) => {
  try {
    const { to, subject, message } = req.body;
    
    if (!to || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: to, subject, message"
      });
    }

    console.log(`Testing email delivery to: ${to}`);
    
    const result = await sendEmail({
      to,
      subject,
      html: `<p>${message}</p>`,
      text: message
    });

    res.json({
      success: result,
      message: result ? "Test email sent successfully" : "Failed to send test email"
    });
  } catch (error) {
    console.error("Test email error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while sending test email"
    });
  }
});

export { testEmailRouter };