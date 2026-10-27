<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $add = function (string $table, array $cols) {
            Schema::table($table, function (Blueprint $t) use ($table, $cols) {
                foreach ($cols as $c => $after) {
                    if (! Schema::hasColumn($table, $c)) {
                        $t->string($c)->nullable()->after($after);
                    }
                }
            });
        };
        $add('licenses', ['name_en' => 'name', 'issuer_en' => 'issuer']);
        $add('tasks', ['title_en' => 'title']);
        Schema::table('tasks', fn (Blueprint $t) => Schema::hasColumn('tasks', 'description_en') ?: $t->text('description_en')->nullable()->after('description'));
        $add('users', ['name_en' => 'name', 'title_en' => 'title']);
        $add('announcements', ['title_en' => 'title']);
        Schema::table('announcements', fn (Blueprint $t) => Schema::hasColumn('announcements', 'body_en') ?: $t->text('body_en')->nullable()->after('body'));
        $add('companies', ['principal_name_en' => 'principal_name', 'city_en' => 'city', 'address_en' => 'address']);
    }

    public function down(): void
    {
        $drop = function (string $table, array $cols) {
            Schema::table($table, function (Blueprint $t) use ($table, $cols) {
                foreach ($cols as $c) {
                    if (Schema::hasColumn($table, $c)) {
                        $t->dropColumn($c);
                    }
                }
            });
        };
        $drop('licenses', ['name_en', 'issuer_en']);
        $drop('tasks', ['title_en', 'description_en']);
        $drop('users', ['name_en', 'title_en']);
        $drop('announcements', ['title_en', 'body_en']);
        $drop('companies', ['principal_name_en', 'city_en', 'address_en']);
    }
};
