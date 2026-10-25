<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * School inventory: assets (furniture, devices…) and consumables (stationery…), where they are,
 * and every stock movement (in / out / transfer / adjust / dispose) that changed a quantity.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventory_categories', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->string('name', 120);
            $t->unsignedInteger('sort')->default(0);
            $t->timestamps();
        });

        Schema::create('inventory_locations', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->string('name', 120);
            $t->text('notes')->nullable();
            $t->timestamps();
        });

        Schema::create('inventory_items', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->unsignedBigInteger('category_id')->nullable()->index();
            $t->unsignedBigInteger('location_id')->nullable()->index();
            $t->string('name');
            $t->string('type', 20)->default('asset'); // asset | consumable
            $t->string('unit', 30)->nullable();
            $t->decimal('quantity', 12, 2)->default(0);
            $t->decimal('min_quantity', 12, 2)->default(0); // reorder level (consumables)
            $t->string('condition', 20)->default('good'); // good | needs_repair | damaged
            $t->decimal('unit_cost', 12, 3)->default(0);
            $t->date('purchase_date')->nullable();
            $t->string('serial_no', 80)->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
        });

        Schema::create('inventory_movements', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('company_id')->index();
            $t->unsignedBigInteger('item_id')->index();
            $t->string('type', 20); // in | out | transfer | adjust | dispose
            $t->decimal('quantity', 12, 2);
            $t->unsignedBigInteger('from_location_id')->nullable();
            $t->unsignedBigInteger('to_location_id')->nullable();
            $t->date('date');
            $t->string('reason')->nullable();
            $t->unsignedBigInteger('created_by')->nullable();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_movements');
        Schema::dropIfExists('inventory_items');
        Schema::dropIfExists('inventory_locations');
        Schema::dropIfExists('inventory_categories');
    }
};
