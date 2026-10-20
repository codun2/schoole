<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A school — the tenant of the platform. Every school-owned record carries
 * its company_id and is scoped through the BelongsToCompany trait.
 */
class Company extends Model
{
    protected $guarded = ['id', 'created_at', 'updated_at'];

    protected $casts = [
        'trial_ends_at'        => 'datetime',
        'subscription_ends_at' => 'datetime',
        'tax_rate'             => 'decimal:2',
        'settings'             => 'array',
    ];

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    /** The school's current academic year id (falls back to the latest one). */
    public function currentYearId(): ?int
    {
        $q = AcademicYear::withoutGlobalScope('company')->where('company_id', $this->id);

        return (clone $q)->where('is_current', true)->value('id') ?? $q->orderByDesc('id')->value('id');
    }
}
