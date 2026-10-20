<?php

namespace App\Http\Controllers;

use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;

abstract class Controller
{
    /** Validation rule: the id must exist in $table AND belong to the current school. */
    protected function owned(string $table): Exists
    {
        $cid = app()->bound('currentCompanyId') ? app('currentCompanyId') : null;

        return Rule::exists($table, 'id')->where('company_id', $cid);
    }
}
