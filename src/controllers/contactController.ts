import { Request, Response } from 'express';
import { Contact } from '../models/Contact';

interface ContactRequest extends Request {
  body: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    message: string;
  };
}

export const submitContact = async (req: ContactRequest, res: Response): Promise<void> => {
  try {
    const { firstName, lastName, email, phone, message } = req.body;
    
    if (!firstName || !lastName || !email || !message) {
      res.status(400).json({
        success: false,
        error: { message: 'First name, last name, email, and message are required' },
      });
      return;
    }
    
    const contact = new Contact({
      firstName,
      lastName,
      email,
      phone,
      message,
      ipAddress: req.ip || (req.socket && req.socket.remoteAddress),
      userAgent: req.get('User-Agent'),
    });
    
    await contact.save();
    
    // TODO: Send email notification to admin
    // TODO: Send auto-reply to user
    
    res.status(201).json({
      success: true,
      data: {
        id: contact._id,
        message: 'Your message has been sent successfully. We will get back to you soon!',
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to submit contact form',
        details: (error as Error).message,
      },
    });
  }
};

// Get all contacts (admin only)
export const getContacts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    
    const filter: any = {};
    if (status) {
      filter.status = status;
    }
    
    const options = {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      sort: { createdAt: -1 },
    };
    
    const contacts = await Contact.find(filter)
      .sort({ createdAt: -1 })
      .limit(options.limit)
      .skip((options.page - 1) * options.limit);
    
    const total = await Contact.countDocuments(filter);
    
    res.status(200).json({
      success: true,
      data: {
        contacts,
        pagination: {
          page: options.page,
          limit: options.limit,
          total,
          pages: Math.ceil(total / options.limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get contacts',
        details: (error as Error).message,
      },
    });
  }
};

// Update contact status (admin only)
export const updateContactStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['unread', 'read', 'responded'].includes(status)) {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid status. Must be: unread, read, or responded' },
      });
      return;
    }
    
    const contact = await Contact.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );
    
    if (!contact) {
      res.status(404).json({
        success: false,
        error: { message: 'Contact not found' },
      });
      return;
    }
    
    res.status(200).json({
      success: true,
      data: contact,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to update contact status',
        details: (error as Error).message,
      },
    });
  }
};
