import mongoose from 'mongoose';

const simulationSchema = new mongoose.Schema({
    inputs: {
        availableDrivers: {
            type: Number,
            required: [true, "Available drivers count is required"],
            min: [1, "At least 1 driver is required"],
            max: [100, "Cannot exceed 100 drivers"]
        },
        routeStartTime: {
            type: String,
            required: [true, "Route start time is required"],
            match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Start time must be in HH:MM format"]
        },
        maxHoursPerDriver: {
            type: Number,
            required: [true, "Max hours per driver is required"],
            min: [1, "Max hours must be at least 1"],
            max: [16, "Max hours cannot exceed 16"]
        },
        simulationName: {
            type: String,
            trim: true,
            maxlength: [100, "Simulation name cannot exceed 100 characters"]
        },
        description: {
            type: String,
            trim: true,
            maxlength: [500, "Description cannot exceed 500 characters"]
        }
    },
    results: {
        totalProfit: {
            type: Number,
            required: [true, "Total profit is required"]
        },
        efficiencyScore: {
            type: Number,
            required: [true, "Efficiency score is required"],
            min: [0, "Efficiency score cannot be negative"],
            max: [100, "Efficiency score cannot exceed 100%"]
        },
        onTimeCount: {
            type: Number,
            required: [true, "On-time count is required"],
            min: [0, "On-time count cannot be negative"]
        },
        lateCount: {
            type: Number,
            required: [true, "Late count is required"],
            min: [0, "Late count cannot be negative"]
        },
        totalOrders: {
            type: Number,
            required: [true, "Total orders is required"],
            min: [0, "Total orders cannot be negative"]
        },
        fuelCostBreakdown: {
            total: {
                type: Number,
                required: true,
                min: [0, "Total fuel cost cannot be negative"]
            },
            byTrafficLevel: {
                Low: {
                    type: Number,
                    default: 0,
                    min: [0, "Low traffic fuel cost cannot be negative"]
                },
                Medium: {
                    type: Number,
                    default: 0,
                    min: [0, "Medium traffic fuel cost cannot be negative"]
                },
                High: {
                    type: Number,
                    default: 0,
                    min: [0, "High traffic fuel cost cannot be negative"]
                }
            }
        },
        penalties: {
            type: Number,
            default: 0,
            min: [0, "Penalties cannot be negative"]
        },
        bonuses: {
            type: Number,
            default: 0,
            min: [0, "Bonuses cannot be negative"]
        },
        averageDeliveryTime: {
            type: Number,
            default: 0,
            min: [0, "Average delivery time cannot be negative"]
        },
        driverUtilization: {
            type: Number,
            min: [0, "Driver utilization cannot be negative"],
            max: [100, "Driver utilization cannot exceed 100%"]
        }
    },
    executedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, "Executed by user is required"]
    },
    executionTime: {
        type: Number, 
        default: 0
    },
    status: {
        type: String,
        enum: ['running', 'completed', 'failed', 'cancelled'],
        default: 'completed'
    },
    errorMessage: {
        type: String,
        maxlength: [1000, "Error message cannot exceed 1000 characters"]
    },
    ordersProcessed: [{
        orderId: Number,
        driverAssigned: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Driver'
        },
        routeUsed: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Route'
        },
        profit: Number,
        wasOnTime: Boolean,
        penalty: Number,
        bonus: Number,
        fuelCost: Number
    }],
    metadata: {
        version: {
            type: String,
            default: '1.0.0'
        },
        algorithmUsed: {
            type: String,
            default: 'round-robin-assignment'
        },
        configurationHash: String
    }
}, {
    timestamps: true
});

simulationSchema.index({ executedBy: 1 });
simulationSchema.index({ createdAt: -1 });
simulationSchema.index({ status: 1 });
simulationSchema.index({ 'results.efficiencyScore': -1 });
simulationSchema.index({ 'results.totalProfit': -1 });

simulationSchema.virtual('durationInSeconds').get(function() {
    return Math.round(this.executionTime / 1000);
});

simulationSchema.virtual('profitPerOrder').get(function() {
    return this.results.totalOrders > 0 ? 
        Math.round((this.results.totalProfit / this.results.totalOrders) * 100) / 100 : 0;
});

simulationSchema.virtual('successRate').get(function() {
    return this.results.totalOrders > 0 ? 
        Math.round((this.results.onTimeCount / this.results.totalOrders) * 100) : 0;
});

simulationSchema.methods.addProcessedOrder = function(orderData) {
    this.ordersProcessed.push(orderData);
    return this.save();
};

simulationSchema.methods.calculateROI = function() {
    const totalCosts = this.results.fuelCostBreakdown.total + this.results.penalties;
    const totalRevenue = this.results.totalProfit + totalCosts;
    
    return totalCosts > 0 ? 
        Math.round(((totalRevenue - totalCosts) / totalCosts) * 100) : 0;
};

simulationSchema.methods.getPerformanceSummary = function() {
    return {
        totalProfit: this.results.totalProfit,
        efficiencyScore: this.results.efficiencyScore,
        successRate: this.successRate,
        profitPerOrder: this.profitPerOrder,
        roi: this.calculateROI(),
        driverUtilization: this.results.driverUtilization,
        totalOrdersProcessed: this.results.totalOrders,
        executionTime: this.durationInSeconds
    };
};

simulationSchema.statics.findTopPerforming = function(limit = 10) {
    return this.find({ status: 'completed' })
        .sort({ 'results.totalProfit': -1, 'results.efficiencyScore': -1 })
        .limit(limit)
        .populate('executedBy', 'username fullName');
};

simulationSchema.statics.getSimulationAnalytics = function() {
    return this.aggregate([
        { $match: { status: 'completed' } },
        {
            $group: {
                _id: null,
                totalSimulations: { $sum: 1 },
                avgProfit: { $avg: '$results.totalProfit' },
                avgEfficiency: { $avg: '$results.efficiencyScore' },
                maxProfit: { $max: '$results.totalProfit' },
                minProfit: { $min: '$results.totalProfit' },
                avgExecutionTime: { $avg: '$executionTime' },
                totalOrdersProcessed: { $sum: '$results.totalOrders' }
            }
        }
    ]);
};

simulationSchema.statics.compareSimulations = function(simulationIds) {
    return this.find({ 
        _id: { $in: simulationIds },
        status: 'completed'
    }).select('inputs results executedBy createdAt');
};

simulationSchema.pre('save', function(next) {
    if (this.isModified('results')) {
        if (!this.results.driverUtilization && this.inputs.availableDrivers) {
            const ordersPerDriver = this.results.totalOrders / this.inputs.availableDrivers;
            this.results.driverUtilization = Math.min(100, Math.round(ordersPerDriver * 10));
        }
        
        if (this.results.totalOrders > 0) {
            this.results.efficiencyScore = Math.round(
                (this.results.onTimeCount / this.results.totalOrders) * 100
            );
        }
    }
    next();
});

simulationSchema.set('toJSON', { virtuals: true });
simulationSchema.set('toObject', { virtuals: true });

export const Simulation = mongoose.model("Simulation", simulationSchema);
