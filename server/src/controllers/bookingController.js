import Joi from 'joi';
import mongoose from 'mongoose';
import { Booking } from '../models/Booking.js';

// Validation schema for creating a booking
const createBookingSchema = Joi.object({
  roomNumber: Joi.string().trim().required(),

  startDate: Joi.date().required(),

  endDate: Joi.date()
    .greater(Joi.ref('startDate'))
    .required(),

  purpose: Joi.string().trim().allow('').optional(),

  bookedBy: Joi.string()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.message({ custom: 'bookedBy must be a valid ObjectId' });
      }
      return value;
    })
    .optional(),
});

// Validation schema for updating a booking
const updateBookingSchema = Joi.object({
  roomNumber: Joi.string().trim(),

  startDate: Joi.date(),

  endDate: Joi.date(),

  purpose: Joi.string().trim().allow(''),

  bookedBy: Joi.string()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.message({ custom: 'bookedBy must be a valid ObjectId' });
      }
      return value;
    }),
}).min(1);


// Helper function to detect booking conflicts
async function hasConflict(roomNumber, startDate, endDate, excludeId = null) {
  const query = {
    roomNumber,
    startDate: { $lt: endDate },
    endDate: { $gt: startDate },
  };

  // When updating, don't compare the booking with itself
  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const conflictingBooking = await Booking.findOne(query);

  return Boolean(conflictingBooking);
}


// GET /api/bookings
export async function getAllBookings(req, res, next) {
  try {
    const bookings = await Booking.find()
      .populate('bookedBy')
      .sort({ startDate: 1 });

    return res.status(200).json(bookings);
  } catch (err) {
    next(err);
  }
}


// GET /api/bookings/:id
export async function getBooking(req, res, next) {
  try {
    console.log('GET BOOKING CONTROLLER');
    console.log('ID:', req.params.id);

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid booking ID',
      });
    }

    const booking = await Booking.findById(req.params.id)
      .populate('bookedBy', 'name email');

    console.log('FOUND BOOKING:', booking);

    if (!booking) {
      return res.status(404).json({
        message: 'Booking not found',
      });
    }

    return res.status(200).json(booking);
  } catch (err) {
    next(err);
  }
}


// POST /api/bookings
export async function createBooking(req, res, next) {
  try {
    const { error, value } = createBookingSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        message: error.details[0].message,
      });
    }

    const {
      roomNumber,
      startDate,
      endDate,
      purpose,
      bookedBy,
    } = value;

    const conflict = await hasConflict(
      roomNumber,
      startDate,
      endDate
    );

    if (conflict) {
      return res.status(409).json({
        message: 'Booking conflicts with an existing booking for this room',
      });
    }

    const booking = await Booking.create({
      roomNumber,
      startDate,
      endDate,
      purpose,
      bookedBy,
    });

    return res.status(201).json(booking);
  } catch (err) {
    next(err);
  }
}


// PATCH /api/bookings/:id
export async function updateBooking(req, res, next) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid booking ID',
      });
    }

    const { error, value } = updateBookingSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        message: error.details[0].message,
      });
    }

    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        message: 'Booking not found',
      });
    }

    // PATCH may contain only some fields, so combine the new values
    // with the existing booking before validating the final date range.
    const roomNumber = value.roomNumber ?? booking.roomNumber;
    const startDate = value.startDate ?? booking.startDate;
    const endDate = value.endDate ?? booking.endDate;

    // startDate must be strictly before endDate
    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({
        message: 'startDate must be before endDate',
      });
    }

    const conflict = await hasConflict(
      roomNumber,
      startDate,
      endDate,
      booking._id
    );

    if (conflict) {
      return res.status(409).json({
        message: 'Booking conflicts with an existing booking for this room',
      });
    }

    Object.assign(booking, value);

    await booking.save();

    return res.status(200).json(booking);
  } catch (err) {
    next(err);
  }
}


// DELETE /api/bookings/:id
export async function deleteBooking(req, res, next) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid booking ID',
      });
    }

    const booking = await Booking.findByIdAndDelete(req.params.id);

    if (!booking) {
      return res.status(404).json({
        message: 'Booking not found',
      });
    }

    return res.status(200).json({
      message: 'Booking deleted successfully',
    });
  } catch (err) {
    next(err);
  }
}