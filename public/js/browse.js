// Filter skills by search and category
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('searchInput');
  const categoryFilter = document.getElementById('categoryFilter');
  const skillsContainer = document.getElementById('skillsContainer');
  const skillCards = Array.from(document.querySelectorAll('#skillsContainer .col'));
  const swapModal = new bootstrap.Modal(document.getElementById('swapModal'));

  // Filter function
  function filterSkills() {
    const searchTerm = searchInput.value.toLowerCase();
    const selectedCategory = categoryFilter.value;

    skillCards.forEach(card => {
      const cardText = card.textContent.toLowerCase();
      const cardCategory = card.dataset.category;
      
      const matchesSearch = cardText.includes(searchTerm);
      const matchesCategory = selectedCategory === '' || cardCategory === selectedCategory;
      
      card.style.display = (matchesSearch && matchesCategory) ? 'block' : 'none';
    });
  }

  // Swap request modal handling
  document.querySelectorAll('.request-swap').forEach(btn => {
    btn.addEventListener('click', function() {
      const skillId = this.dataset.skillId;
      const userId = this.dataset.userId;
      const skillName = this.closest('.card').querySelector('.card-title').textContent;
      
      document.getElementById('modalSkillId').value = skillId;
      document.getElementById('modalRecipientId').value = userId;
      document.getElementById('requestedSkillName').textContent = skillName;
      
      swapModal.show();
    });
  });

  // Submit swap request
  document.getElementById('submitSwapRequest').addEventListener('click', async () => {
    const form = document.getElementById('swapForm');
    const formData = new FormData(form);
    
    try {
      const response = await fetch('/swap-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(Object.fromEntries(formData))
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert('Swap request sent successfully!');
        swapModal.hide();
      } else {
        throw new Error(result.error || 'Failed to send request');
      }
    } catch (err) {
      console.error('Error:', err);
      alert('Error sending swap request');
    }
  });

  // Event listeners
  searchInput.addEventListener('input', filterSkills);
  categoryFilter.addEventListener('change', filterSkills);
});