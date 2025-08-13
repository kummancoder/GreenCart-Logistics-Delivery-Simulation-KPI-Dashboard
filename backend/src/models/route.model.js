import mongoose from 'mongoose';

const routeSchema = new mongoose.Schema({
    routeId: {
        type: Number,
        required: [true, "Route ID is required"],
        unique: true,
        min: [1, "Route ID must be positive"]
    },
    distanceKm: {
        type: Number,
        required: [true, "Distance is required"],
        min: [0.1, "Distance must be at least 0.1 km"],
        max: [1000, "Distance cannot exceed 1000 km"]
    },
    trafficLevel: {
        type: String,
        required: [true, "Traffic level is required"],
        enum: {
            values: ['Low', 'Medium', 'High'],
            message: "Traffic level must be Low, Medium, or High"
        }
    },
    baseTimeMin: {
        type: Number,
        required: [true, "Base time is required"],
        min: [1, "Base time must be at least 1 minute"],
        max: [600, "Base time cannot exceed 600 minutes"]
    },
    isActive: {
        type: Boolean,
        default: true
    },
    area: {
        type: String,
        trim: true,
        maxlength: [100, "Area name cannot exceed 100 characters"]
    },
    difficulty: {
        type: String,
        enum: ['easy', 'medium', 'hard'],
        default: 'medium'
    },
    averageDeliveryTime: {
        type: Number,
        default: 0
    },
    totalDeliveries: {
        type: Number,
        default: 0,
        min: [0, "Total deliveries cannot be negative"]
    }
}, {
    timestamps: true
});

routeSchema.index({ routeId: 1 }, { unique: true });
routeSchema.index({ isActive: 1 });
routeSchema.index({ trafficLevel: 1 });
routeSchema.index({ distanceKm: 1 });

routeSchema.virtual('baseFuelCost').get(function() {
    return this.distanceKm * 5; // ₹5/km base cost
});

routeSchema.virtual('trafficSurcharge').get(function() {
    return this.trafficLevel === 'High' ? this.distanceKm * 2 : 0;
});

routeSchema.virtual('totalFuelCost').get(function() {
    return this.baseFuelCost + this.trafficSurcharge;
});

routeSchema.virtual('allowedDeliveryTime').get(function() {
    return this.baseTimeMin + 10;
});

routeSchema.methods.calculateFuelCost = function() {
    const baseCost = this.distanceKm * 5; // ₹5/km
    const trafficSurcharge = this.trafficLevel === 'High' ? this.distanceKm * 2 : 0; // +₹2/km if high traffic
    return {
        baseCost,
        trafficSurcharge,
        totalCost: baseCost + trafficSurcharge
    };
};

routeSchema.methods.calculateDeliveryTime = function(driverFatigued = false) {
    let deliveryTime = this.baseTimeMin;
    
    if (driverFatigued) {
        deliveryTime = Math.ceil(deliveryTime * 1.3);
    }
    
    const trafficMultiplier = {
        'Low': 1.0,
        'Medium': 1.1,
        'High': 1.2
    };
    
    deliveryTime = Math.ceil(deliveryTime * trafficMultiplier[this.trafficLevel]);
    
    return deliveryTime;
};

routeSchema.methods.isDeliveryOnTime = function(actualDeliveryTimeMin, driverFatigued = false) {
    const expectedTime = this.calculateDeliveryTime(driverFatigued);
    const allowedTime = expectedTime + 10; 
    return actualDeliveryTimeMin <= allowedTime;
};

routeSchema.methods.updateRouteStats = function(actualDeliveryTime) {
    this.totalDeliveries += 1;
    
    const currentAvg = this.averageDeliveryTime || this.baseTimeMin;
    this.averageDeliveryTime = Math.round(
        ((currentAvg * (this.totalDeliveries - 1)) + actualDeliveryTime) / this.totalDeliveries
    );
    
    return this.save();
};

routeSchema.statics.findByTrafficLevel = function(trafficLevel) {
    return this.find({ 
        trafficLevel, 
        isActive: true 
    }).sort({ distanceKm: 1 });
};

routeSchema.statics.getRouteStatistics = function() {
    return this.aggregate([
        { $match: { isActive: true } },
        {
            $group: {
                _id: '$trafficLevel',
                avgDistance: { $avg: '$distanceKm' },
                avgBaseTime: { $avg: '$baseTimeMin' },
                totalRoutes: { $sum: 1 },
                avgFuelCost: { $avg: { $multiply: ['$distanceKm', 5] } }
            }
        }
    ]);
};

driverSchema.set('toJSON', { virtuals: true });
driverSchema.set('toObject', { virtuals: true });

export const Route = mongoose.model("Route", routeSchema);
