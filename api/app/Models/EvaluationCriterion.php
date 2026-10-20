<?php

namespace App\Models;

class EvaluationCriterion extends TenantModel
{
    protected $casts = ['weight' => 'decimal:2', 'max_score' => 'decimal:2'];
}
