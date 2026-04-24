const twilio = require('twilio');

// Initialize Twilio client
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Calculate delivery time based on distance in km
const calculateDeliveryTime = (distanceKm) => {
  // Assuming average speed of 25 km/h in city traffic
  const averageSpeedKmh = 25;
  const timeMinutes = Math.ceil((distanceKm / averageSpeedKmh) * 60);
  const minTime = Math.max(10, timeMinutes);
  const maxTime = minTime + 20;
  return { min: minTime, max: maxTime };
};

// Calculate Haversine distance
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Format WhatsApp order message
const formatOrderMessage = (orderDetails) => {
  const { items, customer, totalAmount, deliveryTime, mapsLink, storeName } = orderDetails;

  let itemsText = '';
  for (const item of items) {
    itemsText += `\n🛍 ${item.name} x${item.quantity} = ₹${(item.price * item.quantity).toFixed(2)}`;
  }

  const message = `🍎 *${storeName} Order* 🍎

📦 *Order Details:*${itemsText}
💳 Platform fee: ₹20

💰 *Total: ₹${totalAmount}*

👤 *Name:* ${customer.name}
📞 *Phone:* ${customer.phone}
📍 *Address:* ${customer.address}

🗺️ *Location:* ${mapsLink}

⏱️ *Delivery in ${deliveryTime.min}-${deliveryTime.max} mins*

Thank you for choosing ${storeName}!`;

  return message;
};

// Send WhatsApp message to delivery boy
const sendOrderToDeliveryBoy = async (deliveryBoyPhone, orderDetails) => {
  try {
    // Format phone number for WhatsApp (add country code if needed)
    let formattedPhone = deliveryBoyPhone;
    if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+91' + formattedPhone; // Assuming India
    }
    // Convert to WhatsApp format
    formattedPhone = 'whatsapp:' + formattedPhone;

    // Format message
    const messageText = formatOrderMessage(orderDetails);

    console.log(`📱 Sending WhatsApp to ${deliveryBoyPhone}`);
    console.log(`Message: ${messageText}`);

    // Send via Twilio WhatsApp
    const message = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886', // Default Twilio sandbox number
      to: formattedPhone,
      body: messageText
    });

    console.log(`✅ WhatsApp sent successfully. Message ID: ${message.sid}`);
    return {
      success: true,
      messageId: message.sid,
      deliveryBoy: deliveryBoyPhone
    };
  } catch (error) {
    console.error('❌ Failed to send WhatsApp:', error.message);
    throw new Error('Failed to send WhatsApp: ' + error.message);
  }
};

// Send WhatsApp notification (generic)
const sendWhatsAppNotification = async (phoneNumber, message) => {
  try {
    let formattedPhone = phoneNumber;
    if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+91' + phoneNumber;
    }
    formattedPhone = 'whatsapp:' + formattedPhone;

    const result = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886',
      to: formattedPhone,
      body: message
    });

    return {
      success: true,
      messageId: result.sid
    };
  } catch (error) {
    console.error('Error sending WhatsApp:', error);
    throw error;
  }
};

module.exports = {
  sendOrderToDeliveryBoy,
  sendWhatsAppNotification,
  calculateDistance,
  calculateDeliveryTime,
  formatOrderMessage
};
