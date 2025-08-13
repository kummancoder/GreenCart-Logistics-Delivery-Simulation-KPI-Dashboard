import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
    orderId: {
        type: Number,
        required: [true, "Order ID is required"],
        unique: true,
        min: [1, "Order ID must be positive"]
    },
    valueRs: {
        type: Number,
        required: [true, "Order value is required"],
        min: [0, "Order value cannot be negative"],
        max: [100000, "Order value cannot exceed ₹100,000"]
    },
    routeId: {
        type: Number,
        required: [true, "Route ID is required"],
        ref: 'Route'
    },
    deliveryTime: {
        type: String,
        required: [true, "Delivery time is required"],
        match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Delivery time must be in HH:MM format"]
    },
    status: {
        type: String,
        enum: {
            values: ['pending', 'assigned', 'in_transit', 'delivered', 'cancelled', 'failed'],
            message: "Invalid order status"
        },
        default: 'pending'
    },
    assignedDriver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Driver',
        default: null
    },
    assignedRoute: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Route',
        default: null
    },
    isOnTime: {
        type: Boolean,
        default: null
    },
    penalty: {
        type: Number,
        default: 0,
        min: [0, "Penalty cannot be negative"]
    },
    bonus: {
        type: Number,
        default: 0,
        min: [0, "Bonus cannot be negative"]
    },
    fuelCost: {
        type: Number,
        default: 0,
        min: [0, "Fuel cost cannot be negative"]
    },
    profit: {
        type: Number,
        default: 0
    },
    actualDeliveryTime: {
        type: String,
        match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Actual delivery time must be in HH:MM format"],
        default: null
    },
    deliveryNotes: {
        type: String,
        maxlength: [500, "Delivery notes cannot exceed 500 characters"],
        trim: true
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    customerRating: {
        type: Number,
        min: [1, "Rating must be at least 1"],
        max: [5, "Rating cannot exceed 5"],
        default: null
    }
}, {
    timestamps: true
});

orderSchema.index({ orderId: 1 }, { unique: true });
orderSchema.index({ status: 1 });
orderSchema.index({ assignedDriver: 1 });
orderSchema.index({ routeId: 1 });
orderSchema.index({ valueRs: 1 });
orderSchema.index({ createdAt: -1 });

orderSchema.virtual('isHighValue').get(function() {
    return this.valueRs > 1000;
});

orderSchema.virtual('deliveryTimeInMinutes').get(function() {
    const [hours, minutes] = this.deliveryTime.split(':').map(Number);
    return hours * 60 + minutes;
});

orderSchema.virtual('actualDeliveryTimeInMinutes').get(function() {
    if (!this.actualDeliveryTime) return null;
    const [hours, minutes] = this.actualDeliveryTime.split(':').map(Number);
    return hours * 60 + minutes;
});

orderSchema.methods.timeToMinutes = function(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
};

orderSchema.methods.minutesToTime = function(minutes) {
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

orderSchema.methods.calculateProfit = function(route, isOnTime = null) {
    let penalty = 0;
    let bonus = 0;
    let fuelCost = 0;

    if (route) {
        fuelCost = route.distanceKm * 5; // Base cost ₹5/km
        if (route.trafficLevel === 'High') {
            fuelCost += route.distanceKm * 2; // +₹2/km surcharge
        }
    }

    if (isOnTime === false) {
        penalty = 50; // ₹50 penalty for late delivery
    }

    if (this.valueRs > 1000 && isOnTime === true) {
        bonus = this.valueRs * 0.1; // 10% bonus
    }

    const profit = this.valueRs + bonus - penalty - fuelCost;

    this.penalty = penalty;
    this.bonus = bonus;
    this.fuelCost = fuelCost;
    this.profit = Math.round(profit * 100) / 100; // Round to 2 decimal places
    this.isOnTime = isOnTime;

    return {
        penalty,
        bonus,
        fuelCost,
        profit: this.profit,
        breakdown: {
            orderValue: this.valueRs,
            bonus,
            penalty,
            fuelCost,
            netProfit: this.profit
        }
    };
};

orderSchema.methods.assignToDriver = function(driverId, routeObjectId) {
    this.assignedDriver = driverId;
    this.assignedRoute = routeObjectId;
    this.status = 'assigned';
    return this.save();
};

orderSchema.methods.markAsDelivered = function(actualDeliveryTime, wasOnTime, customerRating = null) {
    this.status = 'delivered';
    this.actualDeliveryTime = actualDeliveryTime;
    this.isOnTime = wasOnTime;
    if (customerRating) {
        this.customerRating = customerRating;
    }
    return this.save();
};

orderSchema.statics.findByStatus = function(status) {
    return this.find({ status }).populate('assignedDriver assignedRoute');
};

orderSchema.statics.findHighValueOrders = function(minValue = 1000) {
    return this.find({ 
        valueRs: { $gt: minValue },
        status: { $ne: 'cancelled' }
    }).sort({ valueRs: -1 });
};

orderSchema.statics.getOrderStatistics = function() {
    return this.aggregate([
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
                totalValue: { $sum: '$valueRs' },
                avgValue: { $avg: '$valueRs' },
                totalProfit: { $sum: '$profit' },
                totalPenalties: { $sum: '$penalty' },
                totalBonuses: { $sum: '$bonus' }
            }
        }
    ]);
};

orderSchema.statics.getDeliveryMetrics = function() {
    return this.aggregate([
        { $match: { isOnTime: { $ne: null } } },
        {
            $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                onTimeDeliveries: {
                    $sum: { $cond: [{ $eq: ['$isOnTime', true] }, 1, 0] }
                },
                lateDeliveries: {
                    $sum: { $cond: [{ $eq: ['$isOnTime', false] }, 1, 0] }
                },
                totalProfit: { $sum: '$profit' },
                avgOrderValue: { $avg: '$valueRs' }
            }
        },
        {
            $addFields: {
                efficiencyScore: {
                    $multiply: [
                        { $divide: ['$onTimeDeliveries', '$totalOrders'] },
                        100
                    ]
                }
            }
        }
    ]);
};

orderSchema.set('toJSON', { virtuals: true });
orderSchema.set('toObject', { virtuals: true });

export const Order = mongoose.model("Order", orderSchema);
