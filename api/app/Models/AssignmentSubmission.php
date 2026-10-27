<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AssignmentSubmission extends TenantModel
{
    protected $casts = ['submitted' => 'boolean', 'mark' => 'decimal:2'];

    public function assignment(): BelongsTo { return $this->belongsTo(Assignment::class); }
    public function student(): BelongsTo { return $this->belongsTo(Student::class); }
}
