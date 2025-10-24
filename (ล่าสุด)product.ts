import { Component, OnInit, AfterViewInit, } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';

// Chart.js imports
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

// Declare Leaflet to avoid TypeScript errors
declare let L: any;

@Component({
  selector: 'app-product',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './product.html',
  styleUrls: ['./product.css']
})
export class Product implements OnInit, AfterViewInit {

  // Original data properties
  data: any[] = [];
  filteredData: any[] = [];
  isEditMode = false;
  isFormVisible = false;
  searchTerm: string = '';

  // Pagination Properties
  currentPage: number = 1;
  itemsPerPage: number = 5;  // แบ่งหน้า 5 แถว
  totalPages: number = 1;
  paginatedData: any[] = [];

  // Analytics properties
  private priceChart: any;
  private categoryChart: any;
  private supplierMap: any;
  private mapMarkers: any[] = [];
  private initTimeout: any;

  newProduct = {
    ProductID: '',
    ProductName: '',
    SupplierID: '',
    CategoryID: '',
    Unit: '',
    Price: ''
  };

  private apiUrl = 'http://localhost/ajbo';

  

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.viewProducts();
    
  }

  ngAfterViewInit() {
    // รอ DOM set ตัวก่อนสร้างกราฟ/แผนที่
    this.initTimeout = setTimeout(() => {
      if (this.priceChart || this.categoryChart || this.supplierMap) return;
      this.initializeCharts();
      this.initializeMap();
    }, 100);
  }

  

  // ==================== LEAFLET MAP METHODS ====================

  initializeMap() {
    const mapElement = document.getElementById('supplierMap');
    if (!mapElement) {
      console.warn('Map element not found');
      return;
    }
    if (this.supplierMap) {
      console.warn('Map already initialized');
      return;
    }

    try {
      if (typeof L === 'undefined') {
        console.error('Leaflet library not loaded');
        setTimeout(() => this.initializeMap(), 500);
        return;
      }

      this.supplierMap = L.map('supplierMap').setView([19.028608933654667, 99.89630200733336], 12);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18,
        minZoom: 3
      }).addTo(this.supplierMap);

      

      // ⭐ สำคัญ: ให้ Leaflet คำนวณขนาดใหม่หลัง DOM เซ็ตตัว
      setTimeout(() => this.resetMapView(), 0);

      console.log('Map initialized successfully');
    } catch (error) {
      console.error('Error initializing map:', error);
    }
    
    this.supplierMap.on('click', (e: any) => {
  const { lat, lng } = e.latlng;
  L.marker([lat, lng])
    .addTo(this.supplierMap)
    .bindPopup(`📍 New Marker<br>Lat: ${lat.toFixed(4)}<br>Lng: ${lng.toFixed(4)}`)
    .openPopup();
});
  }


  createSupplierPopup(supplier: any): string {
    return `
      <div class="supplier-popup">
        <h4>${supplier.name}</h4>
        <div class="supplier-info">
          <p><strong>ID:</strong> ${supplier.id}</p>
          <p><strong>Products:</strong> ${supplier.products}</p>
          <p><strong>Avg Price:</strong> $${supplier.avgPrice}</p>
          <p><strong>Type:</strong> ${supplier.type.replace('-', ' ').toUpperCase()}</p>
        </div>
      </div>
    `;
  }

  /** ⭐ ใช้ทุกครั้งที่เลย์เอาต์มีโอกาสเปลี่ยน เพื่อกัน map คิดขนาดผิด */
  resetMapView() {
    if (this.supplierMap && this.mapMarkers.length > 0) {
      const group = new L.featureGroup(this.mapMarkers);
      this.supplierMap.invalidateSize();   // ให้ Leaflet reflow ขนาด container ใหม่
      this.supplierMap.fitBounds(group.getBounds().pad(0.1));
      
    }
     if (this.supplierMap) {
    this.supplierMap.setView([19.028608933654667, 99.89630200733336], 15);
     }
  }
  

  updateMap() {
    
    setTimeout(() => this.resetMapView(), 0);
  }

  // ==================== CHART METHODS ====================

  refreshAnalytics() {
    this.updateCharts();
    this.updateMap();
  }

  initializeCharts() {
    if (this.priceChart || this.categoryChart) return;
    this.createPriceChart();
    this.createCategoryChart();
  }

  createPriceChart() {
    const ctx = document.getElementById('priceChart') as HTMLCanvasElement;
    if (!ctx) { console.warn('Price chart canvas not found'); return; }
    

    const priceData = this.calculatePriceRanges(this.getChartSource());

    this.priceChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['0-10', '11-25', '26-50', '51-100', '100+'],
        datasets: [{
          label: 'Number of Products',
          data: priceData,
          backgroundColor: [
            'rgba(46, 204, 113, 0.8)',
            'rgba(52, 152, 219, 0.8)',
            'rgba(155, 89, 182, 0.8)',
            'rgba(241, 196, 15, 0.8)',
            'rgba(231, 76, 60, 0.8)'
          ],
          borderColor: [
            'rgb(46, 204, 113)',
            'rgb(52, 152, 219)',
            'rgb(155, 89, 182)',
            'rgb(241, 196, 15)',
            'rgb(231, 76, 60)'
          ],
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'Number of Products' } }
        }
      }
    });
  }

  createCategoryChart() {
    const ctx = document.getElementById('categoryChart') as HTMLCanvasElement;
    if (!ctx) { console.warn('Category chart canvas not found'); return; }
    

    const categoryData = this.calculateCategoryDistribution(this.getChartSource());

    this.categoryChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: categoryData.labels,
        datasets: [{
          data: categoryData.data,
          backgroundColor: [
            'rgba(52, 152, 219, 0.8)',
            'rgba(46, 204, 113, 0.8)',
            'rgba(155, 89, 182, 0.8)',
            'rgba(241, 196, 15, 0.8)',
            'rgba(231, 76, 60, 0.8)',
            'rgba(26, 188, 156, 0.8)',
            'rgba(230, 126, 34, 0.8)'
          ],
          borderWidth: 2,
          borderColor: 'white'
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'right' } }
      }
    });
  }

  private getChartSource(): any[] {
    return this.filteredData?.length ? this.filteredData : this.data;
  }

  updateCharts() {
    const source = this.getChartSource();
    if (!source || source.length === 0) return;

    const priceRanges = this.calculatePriceRanges(source);
    if (this.priceChart) {
      this.priceChart.data.datasets[0].data = priceRanges;
      this.priceChart.update();
    }

    const categoryData = this.calculateCategoryDistribution(source);
    if (this.categoryChart) {
      this.categoryChart.data.labels = categoryData.labels;
      this.categoryChart.data.datasets[0].data = categoryData.data;
      this.categoryChart.update();
    }
  }

  calculatePriceRanges(source: any[]): number[] {
    const ranges = [0, 0, 0, 0, 0];
    source.forEach(product => {
      const price = parseFloat(product.Price) || 0;
      if (price >= 0 && price <= 10) ranges[0]++;        // 0–10
      else if (price >= 11 && price <= 25) ranges[1]++;  // 11–25
      else if (price >= 26 && price <= 50) ranges[2]++;  // 26–50
      else if (price >= 51 && price <= 100) ranges[3]++; // 51–100
      else if (price > 100) ranges[4]++;                 // 100+
    });
    return ranges;
  }

  calculateCategoryDistribution(source: any[]) {
    const categoryMap = new Map<string, number>();
    source.forEach(product => {
      const category = (product.CategoryID ?? 'Uncategorized').toString();
      categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
    });
    return { labels: Array.from(categoryMap.keys()), data: Array.from(categoryMap.values()) };
  }

  getAveragePrice(): number {
    const src = this.getChartSource();
    if (src.length === 0) return 0;
    const total = src.reduce((sum, product) => sum + (parseFloat(product.Price) || 0), 0);
    return total / src.length;
  }

  getUniqueSuppliers(): number {
    const src = this.getChartSource();
    const suppliers = new Set(src.map(product => product.SupplierID));
    return suppliers.size;
  }

  getUniqueCategories(): number {
    const src = this.getChartSource();
    const categories = new Set(src.map(product => product.CategoryID));
    return categories.size;
  }

  // ==================== ORIGINAL CRUD METHODS ====================

  viewProducts() {
    const url = `${this.apiUrl}/select.php`;
    this.http.get<any>(url).subscribe({
      next: (res) => {
        this.data = Array.isArray(res) ? [...res] : [];
        this.filteredData = [...this.data];
        this.currentPage = 1;
        this.updatePagination();
        this.updateCharts();

        // ⭐ หลังตาราง/กราฟอัปเดต ให้ map reflow อีกรอบ
        setTimeout(() => this.resetMapView(), 0);

        console.log('Products loaded:', this.data.length);
      },
      error: (err) => {
        console.error('Error fetching data:', err);
        this.data = [];
        this.filteredData = [];
        this.currentPage = 1;
        this.updatePagination();
        setTimeout(() => this.resetMapView(), 0);
      }
    });
  }

  searchProducts() {
    if (!this.searchTerm.trim()) {
      this.filteredData = [...this.data];
    } else {
      const searchLower = this.searchTerm.toLowerCase().trim();
      this.filteredData = this.data.filter(product =>
        product.ProductName?.toLowerCase().includes(searchLower) ||
        product.Unit?.toLowerCase().includes(searchLower) ||
        product.Price?.toString().includes(searchLower) ||
        product.ProductID?.toString().includes(searchLower) ||
        product.SupplierID?.toString().includes(searchLower) ||
        product.CategoryID?.toString().includes(searchLower)
      );
    }
    this.currentPage = 1;
    this.updatePagination();
    this.updateCharts();
    setTimeout(() => this.resetMapView(), 0);
  }

  clearSearch() {
    this.searchTerm = '';
    this.filteredData = [...this.data];
    this.currentPage = 1;
    this.updatePagination();
    this.updateCharts();
    setTimeout(() => this.resetMapView(), 0);
  }

  updatePagination() {
    this.totalPages = Math.ceil(this.filteredData.length / this.itemsPerPage) || 1;
    if (this.currentPage > this.totalPages) this.currentPage = this.totalPages;
    

    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    this.paginatedData = this.filteredData.slice(startIndex, endIndex);
  }

  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.updatePagination();
      setTimeout(() => this.resetMapView(), 0);
    }
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.updatePagination();
      setTimeout(() => this.resetMapView(), 0);
    }
  }

  previousPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updatePagination();
      setTimeout(() => this.resetMapView(), 0);
    }
  }

  goToFirstPage() {
    this.currentPage = 1;
    this.updatePagination();
    setTimeout(() => this.resetMapView(), 0);
  }

  goToLastPage() {
    this.currentPage = this.totalPages;
    this.updatePagination();
    setTimeout(() => this.resetMapView(), 0);
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(this.totalPages, startPage + maxVisiblePages - 1);
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    for (let i = startPage; i <= endPage; i++) pages.push(i);
    return pages;
  }

  showAddForm() {
    this.isFormVisible = true;
    this.isEditMode = false;
    this.resetForm();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => this.resetMapView(), 0);
  }

  hideForm() {
    this.isFormVisible = false;
    this.isEditMode = false;
    this.resetForm();
    setTimeout(() => this.resetMapView(), 0);
  }

  insertProduct() {
    if (
      !this.newProduct.ProductName ||
      !this.newProduct.SupplierID ||
      !this.newProduct.CategoryID ||
      !this.newProduct.Unit ||
      !this.newProduct.Price
    ) {
      alert('Please fill in all fields!');
      return;
    }

    const url = `${this.apiUrl}/insert.php`;
    this.http.post<any>(url, this.newProduct).subscribe({
      next: () => {
        alert('Product inserted successfully!');
        this.viewProducts();
        this.hideForm();
      },
      error: (err) => {
        alert('Error inserting product!');
        console.error('Insert error:', err);
      }
    });
  }

  deleteProduct(productId: any) {
    if (!confirm('Are you sure you want to delete this product?')) return;

    const url = `${this.apiUrl}/delete.php`;
    const payload = { ProductID: productId };

    this.http.post<any>(url, payload).subscribe({
      next: (response) => {
        if (response?.success || response === true) {
          alert('✅ Product deleted successfully!');
          this.viewProducts();
        } else {
          alert('❌ Error: ' + (response?.message || 'Delete failed'));
        }
      },
      error: (error) => {
        console.error('Delete error:', error);
        alert('❌ Error deleting product!');
      }
    });
  }

  editProduct(product: any) {
    this.isFormVisible = true;
    this.isEditMode = true;
    this.newProduct = {
      ProductID: product.ProductID,
      ProductName: product.ProductName,
      SupplierID: product.SupplierID,
      CategoryID: product.CategoryID,
      Unit: product.Unit,
      Price: product.Price
    };
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => this.resetMapView(), 0);
  }

  updateProduct() {
    if (
      !this.newProduct.ProductName ||
      !this.newProduct.SupplierID ||
      !this.newProduct.CategoryID ||
      !this.newProduct.Unit ||
      !this.newProduct.Price
    ) {
      alert('Please fill in all fields!');
      return;
    }

    const url = `${this.apiUrl}/update.php`;
    this.http.post<any>(url, this.newProduct).subscribe({
      next: () => {
        alert('Product updated successfully!');
        this.viewProducts();
        this.hideForm();
      },
      error: (err) => {
        alert('Error updating product!');
        console.error('Update error:', err);
      }
    });
  }

  onSubmit() {
    if (this.isEditMode) {
      this.updateProduct();
    } else {
      this.insertProduct();
    }
  }

  cancelEdit() {
    this.hideForm();
  }

  resetForm() {
    this.newProduct = {
      ProductID: '',
      ProductName: '',
      SupplierID: '',
      CategoryID: '',
      Unit: '',
      Price: ''
    };
  }

  // ==================== UTILITY METHODS ====================

  trackByProductID(index: number, product: any): string | number {
    return product?.ProductID || index;
  }
}
