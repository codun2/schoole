<?php

namespace App\Support;

/**
 * Human-readable sequential document numbers per school, e.g. SCH-2026-0003,
 * RC-000014, EMP-000007. The model's global tenant scope keeps each school's
 * sequence independent.
 */
class Numbering
{
    /**
     * @param  class-string<\Illuminate\Database\Eloquent\Model>  $model
     */
    public static function next(string $model, string $prefix, int $pad = 6, string $column = 'number', array $where = []): string
    {
        $q = $model::query()->where($column, 'like', $prefix.'%');
        foreach ($where as $k => $v) {
            $q->where($k, $v);
        }

        $max = 0;
        foreach ($q->pluck($column) as $n) {
            $tail = (int) substr($n, strlen($prefix));
            $max = max($max, $tail);
        }

        return $prefix.str_pad((string) ($max + 1), $pad, '0', STR_PAD_LEFT);
    }
}
